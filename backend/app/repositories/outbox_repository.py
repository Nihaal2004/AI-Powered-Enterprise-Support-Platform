from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox_event import (
    OutboxEvent,
    OutboxStatus,
)


class OutboxRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        event: OutboxEvent,
    ) -> OutboxEvent:
        self.db.add(event)
        await self.db.flush()
        return event

    async def get_pending_batch(
        self,
        limit: int = 20,
    ) -> list[OutboxEvent]:
        now = datetime.now(timezone.utc)

        result = await self.db.execute(
            select(OutboxEvent)
            .where(
                OutboxEvent.status == OutboxStatus.PENDING,
                OutboxEvent.available_at <= now,
            )
            .order_by(OutboxEvent.created_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )

        return list(result.scalars().all())

    async def mark_published(
        self,
        event: OutboxEvent,
    ) -> None:
        event.status = OutboxStatus.PUBLISHED
        event.published_at = datetime.now(timezone.utc)
        event.last_error = None

    async def mark_retry(
        self,
        event: OutboxEvent,
        error: str,
    ) -> None:
        event.attempts += 1
        event.last_error = error

        # simple retry backoff
        event.available_at = (
            datetime.now(timezone.utc)
            + timedelta(seconds=min(60, 5 * event.attempts))
        )

        if event.attempts >= 5:
            event.status = OutboxStatus.FAILED