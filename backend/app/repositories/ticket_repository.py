import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update

from app.models.ticket import Ticket
from app.models.ticket_message import TicketMessage
from app.models.internal_note import InternalNote
class TicketRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_ticket(self, ticket: Ticket):
        self.db.add(ticket)
        await self.db.flush()
        return ticket

    async def get_by_id(self, ticket_id: uuid.UUID):
        result = await self.db.execute(
            select(Ticket).where(Ticket.id == ticket_id)
        )

        return result.scalar_one_or_none()

    async def get_messages(
        self,
        ticket_id: uuid.UUID,
    ) -> list[TicketMessage]:
        result = await self.db.execute(
            select(TicketMessage)
            .where(TicketMessage.ticket_id == ticket_id)
            .order_by(TicketMessage.created_at.asc())
        )

        return list(result.scalars().all())

    async def claim_ticket(
        self,
        ticket_id: uuid.UUID,
        agent_id: uuid.UUID,
    ) -> Ticket | None:
        result = await self.db.execute(
            update(Ticket)
            .where(Ticket.id == ticket_id)
            .where(Ticket.assigned_agent_id.is_(None))
            .values(assigned_agent_id=agent_id)
            .returning(Ticket)
        )

        return result.scalar_one_or_none()

    async def list_unassigned(self) -> list[Ticket]:
        result = await self.db.execute(
            select(Ticket)
            .where(Ticket.assigned_agent_id.is_(None))
            .order_by(Ticket.last_message_at.desc())
        )

        return list(result.scalars().all())


    async def list_assigned_to_agent(
        self,
        agent_id: uuid.UUID,
    ) -> list[Ticket]:
        result = await self.db.execute(
            select(Ticket)
            .where(Ticket.assigned_agent_id == agent_id)
            .order_by(Ticket.last_message_at.desc())
        )

        return list(result.scalars().all())

    async def get_internal_notes(
        self,
        ticket_id: uuid.UUID,
    ) -> list[InternalNote]:
        result = await self.db.execute(
            select(InternalNote)
            .where(InternalNote.ticket_id == ticket_id)
            .order_by(InternalNote.created_at.asc())
        )

        return list(result.scalars().all())