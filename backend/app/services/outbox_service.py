import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox_event import (
    OutboxEvent,
    OutboxStatus,
)
from app.repositories.outbox_repository import OutboxRepository


class OutboxService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = OutboxRepository(db)

    async def add_event(
        self,
        event_type: str,
        aggregate_type: str,
        aggregate_id: uuid.UUID,
        payload: dict,
    ) -> OutboxEvent:
        now = datetime.now(timezone.utc)

        event = OutboxEvent(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
            status=OutboxStatus.PENDING,
            attempts=0,
            available_at=now,
            created_at=now,
            published_at=None,
            last_error=None,
        )

        return await self.repository.create(event)