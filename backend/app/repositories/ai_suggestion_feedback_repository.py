import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion_feedback import AISuggestionFeedback


class AISuggestionFeedbackRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        feedback: AISuggestionFeedback,
    ) -> AISuggestionFeedback:
        self.db.add(feedback)
        await self.db.flush()
        return feedback

    async def get_by_suggestion_id(
        self,
        suggestion_id: uuid.UUID,
    ) -> AISuggestionFeedback | None:
        result = await self.db.execute(
            select(AISuggestionFeedback).where(
                AISuggestionFeedback.suggestion_id
                == suggestion_id
            )
        )

        return result.scalar_one_or_none()