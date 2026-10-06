import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class InternalNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class InternalNoteResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_user_id: uuid.UUID
    body: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }