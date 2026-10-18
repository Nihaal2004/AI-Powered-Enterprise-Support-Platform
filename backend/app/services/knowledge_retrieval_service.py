import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.knowledge_chunk_repository import (
    KnowledgeChunkRepository,
)
from app.services.embedding_service import EmbeddingService


class KnowledgeRetrievalService:
    def __init__(
        self,
        db: AsyncSession,
    ):
        self.repository = KnowledgeChunkRepository(db)
        self.embedding_service = EmbeddingService()

    async def retrieve(
        self,
        query: str,
        top_k: int = 5,
    ):
        query_embedding = await asyncio.to_thread(
            self.embedding_service.embed_query,
            query,
        )

        results = await self.repository.search_similar(
            query_embedding=query_embedding,
            top_k=top_k,
        )

        return [
                {
                    "chunk_id": str(chunk.id),
                    "document_id": str(chunk.document_id),
                    "chunk_index": chunk.chunk_index,
                    "page_number": chunk.page_number,
                    "content": chunk.content,
                    "distance": float(distance),
                    "similarity": 1.0 - float(distance),
                }
                for chunk, distance in results
            ]