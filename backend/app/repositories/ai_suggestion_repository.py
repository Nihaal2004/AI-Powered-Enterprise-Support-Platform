import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion import AISuggestion


class AISuggestionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        suggestion: AISuggestion,
    ) -> AISuggestion:
        self.db.add(suggestion)
        await self.db.flush()
        return suggestion

    async def get_by_id(
        self,
        suggestion_id: uuid.UUID,
    ) -> AISuggestion | None:
        result = await self.db.execute(
            select(AISuggestion).where(
                AISuggestion.id == suggestion_id
            )
        )

        return result.scalar_one_or_none()
    
    async def get_by_id(
        self,
        suggestion_id: uuid.UUID,
    ) -> AISuggestion | None:
        result = await self.db.execute(
            select(AISuggestion).where(
                AISuggestion.id == suggestion_id
            )
        )

        return result.scalar_one_or_none()