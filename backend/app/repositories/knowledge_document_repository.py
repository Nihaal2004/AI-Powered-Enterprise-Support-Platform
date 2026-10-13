import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_document import KnowledgeDocument


class KnowledgeDocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        document: KnowledgeDocument,
    ) -> KnowledgeDocument:
        self.db.add(document)
        await self.db.flush()
        return document

    async def get_by_id(
        self,
        document_id: uuid.UUID,
    ) -> KnowledgeDocument | None:
        result = await self.db.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.id == document_id
            )
        )

        return result.scalar_one_or_none()