"""Run from backend: python -m unittest discover -s tests -p test_ticket_lifecycle.py."""
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.models.ticket import TicketPriority, TicketStatus
from app.models.user import UserRole
from app.services.ticket_service import TicketService, require_active_ticket


class TicketLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.agent = SimpleNamespace(id=uuid.uuid4(), role=UserRole.AGENT)
        self.ticket = SimpleNamespace(
            id=uuid.uuid4(), assigned_agent_id=self.agent.id,
            status=TicketStatus.RESOLVED, priority=TicketPriority.MEDIUM,
            resolved_at=datetime.now(timezone.utc), closed_at=None,
        )
        self.db = AsyncMock()
        self.service = TicketService(self.db)
        self.service.ticket_repository.get_by_id = AsyncMock(return_value=self.ticket)

    async def test_locked_tickets_reject_messages_priority_edits_and_deletes(self):
        for status in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
            self.ticket.status = status
            operations = [
                lambda: self.service.add_message(self.ticket.id, "reply", self.agent),
                lambda: self.service.update_priority(self.ticket.id, TicketPriority.HIGH, None, self.agent),
                lambda: self.service.edit_message(self.ticket.id, uuid.uuid4(), "edit", self.agent),
                lambda: self.service.delete_message(self.ticket.id, uuid.uuid4(), self.agent),
            ]
            for operation in operations:
                with self.subTest(status=status, operation=operation):
                    with self.assertRaisesRegex(PermissionError, "locked"):
                        await operation()
        self.db.commit.assert_not_awaited()

    async def test_reopening_clears_resolution_and_unlocks_ticket(self):
        result = await self.service.update_status(self.ticket.id, TicketStatus.IN_PROGRESS, self.agent)
        self.assertEqual(result.status, TicketStatus.IN_PROGRESS)
        self.assertIsNone(result.resolved_at)
        require_active_ticket(result)

    async def test_closing_preserves_resolution_time_and_sets_closed_time(self):
        resolved_at = self.ticket.resolved_at
        result = await self.service.update_status(self.ticket.id, TicketStatus.CLOSED, self.agent)
        self.assertEqual(result.resolved_at, resolved_at)
        self.assertIsNotNone(result.closed_at)
        with self.assertRaises(RuntimeError):
            await self.service.update_status(self.ticket.id, TicketStatus.IN_PROGRESS, self.agent)

    async def test_other_agents_cannot_reopen_ticket(self):
        other = SimpleNamespace(id=uuid.uuid4(), role=UserRole.AGENT)
        with self.assertRaises(PermissionError):
            await self.service.update_status(self.ticket.id, TicketStatus.IN_PROGRESS, other)
        self.db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
