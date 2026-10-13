import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_document import (
    KnowledgeDocument,
    KnowledgeDocumentStatus,
)
from app.models.user import User, UserRole
from app.repositories.knowledge_document_repository import (
    KnowledgeDocumentRepository,
)
from app.services.outbox_service import OutboxService
from app.services.s3_service import S3Service


class KnowledgeDocumentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = KnowledgeDocumentRepository(db)
        self.outbox = OutboxService(db)
        self.s3 = S3Service()

    async def create_upload(
        self,
        filename: str,
        mime_type: str,
        size_bytes: int,
        current_user: User,
    ):
        if current_user.role != UserRole.ADMIN:
            raise PermissionError(
                "Only admins can upload knowledge documents"
            )

        safe_filename = Path(filename).name
        document_id = uuid.uuid4()

        storage_key = (
            f"knowledge-base/"
            f"{document_id}/"
            f"{safe_filename}"
        )

        now = datetime.now(timezone.utc)

        document = KnowledgeDocument(
            id=document_id,
            uploaded_by_user_id=current_user.id,
            original_filename=safe_filename,
            storage_key=storage_key,
            mime_type=mime_type,
            size_bytes=size_bytes,
            status=KnowledgeDocumentStatus.PENDING_UPLOAD,
            created_at=now,
            uploaded_at=None,
            processing_started_at=None,
            indexed_at=None,
            failed_at=None,
            failure_reason=None,
        )

        try:
            await self.repository.create(document)
            await self.db.commit()
            await self.db.refresh(document)

        except Exception:
            await self.db.rollback()
            raise

        upload_url = self.s3.generate_upload_url(
            object_key=storage_key,
            content_type=mime_type,
            expires_in=300,
        )

        return document, upload_url

    async def confirm_upload(
        self,
        document_id: uuid.UUID,
        current_user: User,
    ) -> KnowledgeDocument:

        if current_user.role != UserRole.ADMIN:
            raise PermissionError(
                "Only admins can confirm knowledge documents"
            )

        document = await self.repository.get_by_id(
            document_id
        )

        if document is None:
            raise ValueError(
                "Knowledge document not found"
            )

        if document.status != KnowledgeDocumentStatus.PENDING_UPLOAD:
            raise RuntimeError(
                f"Document is already {document.status.value}"
            )

        metadata = await self.s3.get_object_metadata(
            document.storage_key
        )

        actual_size = metadata["ContentLength"]

        if actual_size != document.size_bytes:
            raise RuntimeError(
                "Uploaded file size does not match declared size"
            )

        actual_content_type = metadata.get("ContentType")

        if (
            actual_content_type
            and actual_content_type != document.mime_type
        ):
            raise RuntimeError(
                "Uploaded file content type does not match"
            )

        now = datetime.now(timezone.utc)

        document.status = KnowledgeDocumentStatus.UPLOADED
        document.uploaded_at = now

        # IMPORTANT:
        # this creates the event row but does NOT commit.
        await self.outbox.add_event(
            event_type="KB_DOCUMENT_UPLOADED",
            aggregate_type="KB_DOCUMENT",
            aggregate_id=document.id,
            payload={
                "document_id": str(document.id),
                "storage_key": document.storage_key,
                "mime_type": document.mime_type,
            },
        )

        try:
            # Document update + outbox INSERT become atomic here.
            await self.db.commit()
            await self.db.refresh(document)

            return document

        except Exception:
            await self.db.rollback()
            raise