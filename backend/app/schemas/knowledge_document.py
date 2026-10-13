import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.knowledge_document import KnowledgeDocumentStatus


class KnowledgeDocumentUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0, le=25 * 1024 * 1024)


class KnowledgeDocumentUploadResponse(BaseModel):
    document_id: uuid.UUID
    upload_url: str
    storage_key: str
    expires_in: int = 300


class KnowledgeDocumentResponse(BaseModel):
    id: uuid.UUID
    uploaded_by_user_id: uuid.UUID
    original_filename: str
    storage_key: str
    mime_type: str
    size_bytes: int
    status: KnowledgeDocumentStatus
    created_at: datetime
    uploaded_at: datetime | None
    processing_started_at: datetime | None
    indexed_at: datetime | None
    failed_at: datetime | None
    failure_reason: str | None

    model_config = {"from_attributes": True}