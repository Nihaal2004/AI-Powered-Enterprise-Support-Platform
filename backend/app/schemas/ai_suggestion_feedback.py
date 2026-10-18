import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.ai_suggestion_feedback import (
    AISuggestionFeedbackType,
)


class AISuggestionFeedbackRequest(BaseModel):
    feedback_type: AISuggestionFeedbackType
    final_text: str | None = None


class AISuggestionFeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    suggestion_id: uuid.UUID
    feedback_by_user_id: uuid.UUID
    feedback_type: AISuggestionFeedbackType
    final_text: str | None
    created_at: datetime