"""Message response visibility must not change persisted message relationships."""
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from sqlalchemy import inspect
from sqlalchemy.orm import make_transient_to_detached

from app.models.ticket_attachment import TicketAttachment, UploadStatus
from app.models.ticket_message import TicketMessage, MessageType
from app.models.user import UserRole
from app.schemas.message import MessageResponse
from app.services.ticket_service import TicketService


class MessageAttachmentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.message = TicketMessage(
            id=uuid.uuid4(), ticket_id=uuid.uuid4(), author_user_id=uuid.uuid4(),
            message_type=MessageType.AGENT_REPLY, body="Original message",
            created_at=self.now, edited_at=None, deleted_at=None, attachments=[],
        )
        for status in UploadStatus:
            self.message.attachments.append(TicketAttachment(
                id=uuid.uuid4(), message_id=self.message.id,
                uploaded_by_user_id=self.message.author_user_id,
                original_filename=f"{status.value}.txt", storage_key=status.value,
                mime_type="text/plain", size_bytes=5, checksum=None,
                upload_status=status, created_at=self.now,
                uploaded_at=self.now if status == UploadStatus.UPLOADED else None,
            ))
        # Model a loaded row so SQLAlchemy can detect accidental response-time writes.
        make_transient_to_detached(self.message)

    async def test_list_filters_upload_states_without_detaching_rows(self):
        db = AsyncMock()
        service = TicketService(db)
        service.ticket_repository.get_by_id = AsyncMock(return_value=SimpleNamespace())
        service.ticket_repository.get_messages = AsyncMock(return_value=[self.message])
        messages = await service.get_messages(
            self.message.ticket_id, SimpleNamespace(role=UserRole.AGENT),
        )
        response = MessageResponse.model_validate(messages[0])
        self.assertEqual([file.upload_status for file in response.attachments], [UploadStatus.UPLOADED])
        self.assertEqual(len(self.message.attachments), len(UploadStatus))
        self.assertFalse(inspect(self.message).attrs.attachments.history.has_changes())

    async def test_deleted_response_hides_content_without_changing_original(self):
        self.message.deleted_at = self.now
        response = MessageResponse.model_validate(self.message)
        self.assertEqual(response.body, "This message was deleted")
        self.assertEqual(response.attachments, [])
        self.assertEqual(self.message.body, "Original message")
        self.assertEqual(len(self.message.attachments), len(UploadStatus))
        self.assertFalse(inspect(self.message).attrs.attachments.history.has_changes())
        self.assertFalse(inspect(self.message).attrs.body.history.has_changes())

    async def test_message_without_files_serializes_empty_array(self):
        data = MessageResponse.model_validate(self.message).model_dump()
        del data["attachments"]
        self.assertEqual(MessageResponse.model_validate(data).model_dump(mode="json")["attachments"], [])


if __name__ == "__main__":
    unittest.main()
