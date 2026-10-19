import asyncio
import json

from app.messaging.rabbitmq import (
    KB_QUEUE,
    KB_RETRY_KEY,
    KB_DLQ_KEY,
    get_rabbitmq_connection,
    republish_failed_message,
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
from app.services.document_extraction_service import (
    DocumentExtractionService,
)

s3_service = S3Service()
chunking_service = TextChunkingService()
embedding_service = EmbeddingService()
extraction_service = DocumentExtractionService()

async def mark_document_failed(
    document_id: uuid.UUID,
    error: Exception,
) -> None:
    async with AsyncSessionLocal() as db:
        repository = KnowledgeDocumentRepository(db)

        document = await repository.get_by_id(
            document_id
        )

        if document is None:
            return

        if document.status == KnowledgeDocumentStatus.INDEXED:
            return

        document.status = KnowledgeDocumentStatus.FAILED
        document.failed_at = datetime.now(timezone.utc)
        document.failure_reason = str(error)[:2000]

        await db.commit()

async def process_message(message,channel):
    
        document_id = None
        try:
            event = json.loads(
                message.body.decode("utf-8")
            )

            if event["event_type"] != "KB_DOCUMENT_UPLOADED":
                await message.ack()
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

                if document.status == KnowledgeDocumentStatus.INDEXED:
                    print(
                        f"Document {document.id} already indexed; "
                        "skipping duplicate event"
                    )
                    await message.ack()
                    return

                try:
                    document.status = KnowledgeDocumentStatus.PROCESSING
                    document.processing_started_at = datetime.now(
                        timezone.utc
                    )

                    await db.commit()
                    #raise RuntimeError("TEST_KB_RETRY_FAILURE")

                    raw_bytes = await s3_service.download_object(
                        document.storage_key
                    )

                    extracted_sections = extraction_service.extract(
                        raw_bytes=raw_bytes,
                        mime_type=document.mime_type,
                    )

                    if not extracted_sections:
                        raise ValueError(
                            "Document contains no extractable text"
                        )

                    chunk_payloads: list[dict] = []

                    for page_number, text in extracted_sections:
                        page_chunks = chunking_service.chunk_text(text)

                        for chunk_text in page_chunks:
                            chunk_payloads.append(
                                {
                                    "page_number": page_number,
                                    "content": chunk_text,
                                }
                            )

                    if not chunk_payloads:
                        raise ValueError(
                            "Document contains no extractable chunks"
                        )

                    texts = [
                        item["content"]
                        for item in chunk_payloads
                    ]

                    embeddings = embedding_service.embed_documents(
                        texts
                    )

                    now = datetime.now(timezone.utc)

                    chunks = [
                        KnowledgeChunk(
                            document_id=document.id,
                            chunk_index=index,
                            page_number=payload["page_number"],
                            content=payload["content"],
                            embedding=embedding,
                            created_at=now,
                        )
                        for index, (payload, embedding)
                        in enumerate(
                            zip(chunk_payloads, embeddings)
                        )
                    ]
                    await chunk_repository.delete_by_document_id(document.id)
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

                    print(
                        f"Failed to index document "
                        f"{document_id}: {exc}"
                    )

                    raise
            await message.ack()
        except Exception as exc:
            try:
                action = await republish_failed_message(
                    channel,
                    message,
                    retry_key=KB_RETRY_KEY,
                    dlq_key=KB_DLQ_KEY,
                )

            except Exception:
                await message.nack(requeue=True)
                raise

            if action == "DLQ":
                if document_id is not None:
                    await mark_document_failed(
                        document_id,
                        exc,
                    )

                print(
                    f"Knowledge document {document_id} "
                    "exhausted retries; moved to DLQ"
                )

            else:
                print(
                    f"Knowledge document {document_id} failed; "
                    "scheduled for retry"
                )

            await message.ack()


async def main():
    connection = await get_rabbitmq_connection()

    channel = await connection.channel()

    # Don't give this worker unlimited jobs at once.
    await channel.set_qos(
        prefetch_count=1
    )

    await setup_messaging(channel)

    queue = await channel.get_queue(
        KB_QUEUE
    )

    print("KB worker waiting for jobs...")

    async def callback(message):
        await process_message(
            message,
            channel,
        )

    await queue.consume(
        callback
    )

    try:
        await asyncio.Future()

    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())