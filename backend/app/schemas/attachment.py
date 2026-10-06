import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.ticket_attachment import UploadStatus


class AttachmentUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0, le=10 * 1024 * 1024)


class AttachmentUploadResponse(BaseModel):
    attachment_id: uuid.UUID
    upload_url: str
    storage_key: str
    expires_in: int = 300


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    uploaded_by_user_id: uuid.UUID

    original_filename: str
    storage_key: str
    mime_type: str
    size_bytes: int
    checksum: str | None

    upload_status: UploadStatus

    created_at: datetime
    uploaded_at: datetime | None

    model_config = {
        "from_attributes": True
    }

class AttachmentDownloadResponse(BaseModel):
    download_url: str
    expires_in: int = 300