import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.ai_suggestion import AISuggestionStatus


class AISuggestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticket_id: uuid.UUID
    requested_by_user_id: uuid.UUID
    conversation_version: int
    status: AISuggestionStatus
    draft_text: str | None
    citations: list | None
    created_at: datetime
    completed_at: datetime | None
    failed_at: datetime | None
    failure_reason: str | None