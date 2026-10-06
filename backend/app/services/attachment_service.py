import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket_attachment import (
    TicketAttachment,
    UploadStatus,
)
from app.models.user import User, UserRole
from app.repositories.attachment_repository import AttachmentRepository
from app.repositories.ticket_repository import TicketRepository
from app.services.s3_service import S3Service


class AttachmentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.attachment_repository = AttachmentRepository(db)
        self.ticket_repository = TicketRepository(db)
        self.s3 = S3Service()

    async def create_upload(
        self,
        ticket_id: uuid.UUID,
        message_id: uuid.UUID,
        filename: str,
        mime_type: str,
        size_bytes: int,
        current_user: User,
    ):
        ticket = await self.ticket_repository.get_by_id(ticket_id)

        if ticket is None:
            raise ValueError("Ticket not found")

        message = await self.ticket_repository.get_message_by_id(
            message_id
        )

        if message is None or message.ticket_id != ticket_id:
            raise ValueError("Message not found")

        # Only attach files to your own message.
        if message.author_user_id != current_user.id:
            raise PermissionError(
                "You can only attach files to your own messages"
            )

        attachment_id = uuid.uuid4()

        # Never trust filename as part of the unique identity.
        safe_filename = Path(filename).name

        storage_key = (
            f"tickets/{ticket_id}/"
            f"messages/{message_id}/"
            f"{attachment_id}/{safe_filename}"
        )

        now = datetime.now(timezone.utc)

        attachment = TicketAttachment(
            id=attachment_id,
            message_id=message_id,
            uploaded_by_user_id=current_user.id,
            original_filename=safe_filename,
            storage_key=storage_key,
            mime_type=mime_type,
            size_bytes=size_bytes,
            checksum=None,
            upload_status=UploadStatus.PENDING,
            created_at=now,
            uploaded_at=None,
            failed_at=None,
            expired_at=None,
        )

        try:
            await self.attachment_repository.create(attachment)

            await self.db.commit()
            await self.db.refresh(attachment)

        except Exception:
            await self.db.rollback()
            raise

        upload_url = self.s3.generate_upload_url(
            object_key=storage_key,
            content_type=mime_type,
            expires_in=300,
        )

        return attachment, upload_url

    async def confirm_upload(
        self,
        ticket_id: uuid.UUID,
        message_id: uuid.UUID,
        attachment_id: uuid.UUID,
        current_user: User,
    ) -> TicketAttachment:

        attachment = await self.attachment_repository.get_by_id(
            attachment_id
        )

        if attachment is None:
            raise ValueError("Attachment not found")

        if attachment.message_id != message_id:
            raise ValueError("Attachment does not belong to message")

        message = await self.ticket_repository.get_message_by_id(
            message_id
        )

        if message is None or message.ticket_id != ticket_id:
            raise ValueError("Message not found")

        if attachment.uploaded_by_user_id != current_user.id:
            raise PermissionError(
                "You cannot confirm this attachment"
            )

        if attachment.upload_status != UploadStatus.PENDING:
            raise RuntimeError(
                f"Attachment is already {attachment.upload_status.value}"
            )

        metadata = await self.s3.get_object_metadata(
            attachment.storage_key
        )

        actual_size = metadata["ContentLength"]

        if actual_size != attachment.size_bytes:
            now = datetime.now(timezone.utc)

            attachment.upload_status = UploadStatus.FAILED
            attachment.failed_at = now

            await self.db.commit()

            raise RuntimeError(
                "Uploaded file size does not match declared size"
            )

        actual_content_type = metadata.get("ContentType")

        if (
            actual_content_type
            and actual_content_type != attachment.mime_type
        ):
            now = datetime.now(timezone.utc)

            attachment.upload_status = UploadStatus.FAILED
            attachment.failed_at = now

            await self.db.commit()

            raise RuntimeError(
                "Uploaded file content type does not match"
            )

        attachment.upload_status = UploadStatus.UPLOADED
        attachment.uploaded_at = datetime.now(timezone.utc)

        try:
            await self.db.commit()
            await self.db.refresh(attachment)

            return attachment

        except Exception:
            await self.db.rollback()
            raise

    async def _verify_ticket_access(
        self,
        ticket_id: uuid.UUID,
        current_user: User,
    ):
        ticket = await self.ticket_repository.get_by_id(ticket_id)

        if ticket is None:
            raise ValueError("Ticket not found")

        if (
            current_user.role == UserRole.CUSTOMER
            and ticket.customer_id != current_user.id
        ):
            raise PermissionError(
                "You cannot access this ticket"
            )

        return ticket

    async def list_attachments(
        self,
        ticket_id: uuid.UUID,
        message_id: uuid.UUID,
        current_user: User,
    ) -> list[TicketAttachment]:

        await self._verify_ticket_access(
            ticket_id,
            current_user,
        )

        message = await self.ticket_repository.get_message_by_id(
            message_id
        )

        if message is None or message.ticket_id != ticket_id:
            raise ValueError("Message not found")

        attachments = await self.attachment_repository.list_by_message(
            message_id
        )

        return [
            attachment
            for attachment in attachments
            if attachment.upload_status == UploadStatus.UPLOADED
        ]

    async def create_download_url(
        self,
        ticket_id: uuid.UUID,
        message_id: uuid.UUID,
        attachment_id: uuid.UUID,
        current_user: User,
    ) -> str:

        await self._verify_ticket_access(
            ticket_id,
            current_user,
        )

        message = await self.ticket_repository.get_message_by_id(
            message_id
        )

        if message is None or message.ticket_id != ticket_id:
            raise ValueError("Message not found")

        attachment = await self.attachment_repository.get_by_id(
            attachment_id
        )

        if (
            attachment is None
            or attachment.message_id != message_id
        ):
            raise ValueError("Attachment not found")

        if attachment.upload_status != UploadStatus.UPLOADED:
            raise RuntimeError(
                "Attachment is not available for download"
            )

        return self.s3.generate_download_url(
            object_key=attachment.storage_key,
            filename=attachment.original_filename,
            expires_in=300,
        )