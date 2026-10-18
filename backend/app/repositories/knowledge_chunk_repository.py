from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_chunk import KnowledgeChunk



class KnowledgeChunkRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_all(
        self,
        chunks: list[KnowledgeChunk],
    ) -> None:
        self.db.add_all(chunks)
        await self.db.flush()

    async def search_similar(
        self,
        query_embedding: list[float],
        top_k: int = 5,
    ):
        distance = (
            KnowledgeChunk.embedding
            .cosine_distance(query_embedding)
            .label("distance")
        )

        stmt = (
            select(
                KnowledgeChunk,
                distance,
            )
            .order_by(distance)
            .limit(top_k)
        )

        result = await self.db.execute(stmt)

        return result.all()
    async def delete_by_document_id(
        self,
        document_id,
    ) -> None:
        await self.db.execute(
            delete(KnowledgeChunk).where(
                KnowledgeChunk.document_id == document_id
            )
        )