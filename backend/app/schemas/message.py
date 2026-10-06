import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.ticket_message import MessageType


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class MessageResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    author_user_id: uuid.UUID
    message_type: MessageType
    body: str
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None

    model_config = {
        "from_attributes": True
    }

class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)