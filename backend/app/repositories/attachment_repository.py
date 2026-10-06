import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket_attachment import TicketAttachment


class AttachmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        attachment: TicketAttachment,
    ) -> TicketAttachment:
        self.db.add(attachment)
        await self.db.flush()
        return attachment

    async def get_by_id(
        self,
        attachment_id: uuid.UUID,
    ) -> TicketAttachment | None:
        result = await self.db.execute(
            select(TicketAttachment).where(
                TicketAttachment.id == attachment_id
            )
        )

        return result.scalar_one_or_none()

    async def list_by_message(
        self,
        message_id: uuid.UUID,
    ) -> list[TicketAttachment]:
        result = await self.db.execute(
            select(TicketAttachment)
            .where(TicketAttachment.message_id == message_id)
            .order_by(TicketAttachment.created_at.asc())
        )

        return list(result.scalars().all())