import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.ticket_message import MessageType
from app.models.ticket_attachment import UploadStatus
from app.schemas.attachment import AttachmentResponse


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

    attachments: list[AttachmentResponse] = Field(
        default_factory=list
    )

    model_config = {
        "from_attributes": True
    }

    @model_validator(mode="after")
    def visible_content(self) -> "MessageResponse":
        if self.deleted_at is not None:
            self.body = "This message was deleted"
            self.attachments = []
        else:
            self.attachments = [
                attachment for attachment in self.attachments
                if attachment.upload_status == UploadStatus.UPLOADED
            ]
        return self

class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
