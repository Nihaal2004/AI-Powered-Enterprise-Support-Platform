import asyncio
import json

from app.messaging.rabbitmq import (
    KB_QUEUE,
    get_rabbitmq_connection,
    setup_messaging,
)
import uuid
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_document import (
    KnowledgeDocumentStatus,
)
from app.repositories.knowledge_chunk_repository import (
    KnowledgeChunkRepository,
)
from app.repositories.knowledge_document_repository import (
    KnowledgeDocumentRepository,
)
from app.services.embedding_service import EmbeddingService
from app.services.s3_service import S3Service
from app.services.text_chunking_service import TextChunkingService

s3_service = S3Service()
chunking_service = TextChunkingService()
embedding_service = EmbeddingService()

async def process_message(message):
    async with message.process():
        event = json.loads(
            message.body.decode("utf-8")
        )

        if event["event_type"] != "KB_DOCUMENT_UPLOADED":
            return

        document_id = uuid.UUID(
            event["payload"]["document_id"]
        )

        async with AsyncSessionLocal() as db:
            document_repository = KnowledgeDocumentRepository(db)
            chunk_repository = KnowledgeChunkRepository(db)

            document = await document_repository.get_by_id(
                document_id
            )

            if document is None:
                raise ValueError(
                    f"Knowledge document {document_id} not found"
                )

            try:
                document.status = KnowledgeDocumentStatus.PROCESSING
                document.processing_started_at = datetime.now(
                    timezone.utc
                )

                await db.commit()

                raw_bytes = await s3_service.download_object(
                    document.storage_key
                )

                if document.mime_type == "text/plain":
                    text = raw_bytes.decode("utf-8")
                else:
                    raise ValueError(
                        f"Unsupported MIME type: {document.mime_type}"
                    )

                texts = chunking_service.chunk_text(text)

                if not texts:
                    raise ValueError(
                        "Document contains no extractable text"
                    )

                embeddings = embedding_service.embed_documents(
                    texts
                )

                now = datetime.now(timezone.utc)

                chunks = [
                    KnowledgeChunk(
                        document_id=document.id,
                        chunk_index=index,
                        content=text,
                        embedding=embedding,
                        created_at=now,
                    )
                    for index, (text, embedding)
                    in enumerate(zip(texts, embeddings))
                ]

                await chunk_repository.add_all(chunks)

                document.status = KnowledgeDocumentStatus.INDEXED
                document.indexed_at = datetime.now(
                    timezone.utc
                )
                document.failure_reason = None

                await db.commit()

                print(
                    f"Indexed document {document.id} "
                    f"with {len(chunks)} chunk(s)"
                )

            except Exception as exc:
                await db.rollback()

                # Reload because rollback expires/reverts state.
                document = await document_repository.get_by_id(
                    document_id
                )

                if document is not None:
                    document.status = KnowledgeDocumentStatus.FAILED
                    document.failed_at = datetime.now(timezone.utc)
                    document.failure_reason = str(exc)

                    await db.commit()

                print(
                    f"Failed to index document "
                    f"{document_id}: {exc}"
                )

                raise


async def main():
    connection = await get_rabbitmq_connection()

    channel = await connection.channel()

    # Don't give this worker unlimited jobs at once.
    await channel.set_qos(
        prefetch_count=5
    )

    await setup_messaging(channel)

    queue = await channel.get_queue(
        KB_QUEUE
    )

    print("KB worker waiting for jobs...")

    await queue.consume(
        process_message
    )

    try:
        await asyncio.Future()

    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())