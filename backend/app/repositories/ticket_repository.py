import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket


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