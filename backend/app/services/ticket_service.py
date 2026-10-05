from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import (
    Ticket,
    TicketPriority,
    TicketStatus,
)
from app.models.ticket_message import TicketMessage, MessageType
from app.repositories.ticket_repository import TicketRepository
from app.schemas.ticket import TicketCreate

import uuid
from app.models.user import User



class TicketService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ticket_repository = TicketRepository(db)

    async def get_ticket(self, ticket_id: uuid.UUID) -> Ticket | None:
        return await self.ticket_repository.get_by_id(ticket_id)

    async def create_ticket(self, data: TicketCreate, customer_id : uuid.UUID,) -> Ticket:
        now = datetime.now(timezone.utc)

        try:
            # 1. Create the ticket
            ticket = Ticket(
                customer_id=customer_id,
                created_by_user_id=customer_id,
                primary_category_id=data.primary_category_id,
                title=data.title,
                customer_urgency=data.customer_urgency,
                priority=TicketPriority.MEDIUM,
                status=TicketStatus.OPEN,
                conversation_version=1,
                conversation_updated_at=now,
                last_message_at=now,
                created_at=now,
                updated_at=now,
            )

            # 2. INSERT ticket, but don't commit yet
            ticket = await self.ticket_repository.create_ticket(ticket)

            # ticket.id is now available because repository called flush()

            # 3. Create the first conversation message
            initial_message = TicketMessage(
                ticket_id=ticket.id,
                author_user_id=customer_id,
                message_type=MessageType.CUSTOMER_REPLY,
                body=data.initial_message,
                created_at=now,
            )

            self.db.add(initial_message)

            # 4. Commit BOTH ticket + message together
            await self.db.commit()

            return ticket

        except Exception:
            # If either operation fails, undo the entire transaction
            await self.db.rollback()
            raise

    async def get_messages(
        self,
        ticket_id: uuid.UUID,
        current_user: User,
    ) -> list[TicketMessage]:

        ticket = await self.ticket_repository.get_by_id(ticket_id)

        if ticket is None:
            raise ValueError("Ticket not found")

        if ticket.customer_id != current_user.id:
            raise PermissionError("You cannot access this ticket")

        return await self.ticket_repository.get_messages(ticket_id)
    async def add_message(
        self,
        ticket_id: uuid.UUID,
        body: str,
        current_user: User,
    ) -> TicketMessage:

        ticket = await self.ticket_repository.get_by_id(ticket_id)

        if ticket is None:
            raise ValueError("Ticket not found")

        if ticket.customer_id != current_user.id:
            raise PermissionError("You cannot access this ticket")

        now = datetime.now(timezone.utc)

        message = TicketMessage(
            ticket_id=ticket.id,
            author_user_id=current_user.id,
            message_type=MessageType.CUSTOMER_REPLY,
            body=body,
            created_at=now,
        )

        try:
            self.db.add(message)

            ticket.conversation_version += 1
            ticket.conversation_updated_at = now
            ticket.last_message_at = now
            ticket.updated_at = now

            await self.db.commit()
            await self.db.refresh(message)

            return message

        except Exception:
            await self.db.rollback()
            raise