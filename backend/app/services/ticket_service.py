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
from app.models.ticket_assignment_history import TicketAssignmentHistory
from app.models.user import User, UserRole
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

        if current_user.role == UserRole.CUSTOMER:
            if ticket.customer_id != current_user.id:
                raise PermissionError("You cannot access this ticket")

        elif current_user.role in (UserRole.AGENT, UserRole.ADMIN):
            pass

        else:
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

        if current_user.role == UserRole.CUSTOMER:
            if ticket.customer_id != current_user.id:
                raise PermissionError("You cannot access this ticket")

            message_type = MessageType.CUSTOMER_REPLY

        elif current_user.role == UserRole.AGENT:
            if ticket.assigned_agent_id != current_user.id:
                raise PermissionError(
                    "Only the assigned agent can reply to this ticket"
                )

            message_type = MessageType.AGENT_REPLY

        elif current_user.role == UserRole.ADMIN:
            message_type = MessageType.AGENT_REPLY

        else:
            raise PermissionError("You cannot reply to this ticket")

        now = datetime.now(timezone.utc)

        message = TicketMessage(
            ticket_id=ticket.id,
            author_user_id=current_user.id,
            message_type=message_type,
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

    async def claim_ticket(
        self,
        ticket_id: uuid.UUID,
        current_user: User,
    ) -> Ticket:
        if current_user.role != UserRole.AGENT:
            raise PermissionError("Only agents can claim tickets")

        now = datetime.now(timezone.utc)

        try:
            ticket = await self.ticket_repository.claim_ticket(
                ticket_id=ticket_id,
                agent_id=current_user.id,
            )

            if ticket is None:
                raise RuntimeError(
                    "Ticket is already assigned or does not exist"
                )

            history = TicketAssignmentHistory(
                ticket_id=ticket.id,
                from_agent_id=None,
                to_agent_id=current_user.id,
                changed_by_user_id=current_user.id,
                reason="Agent claimed ticket",
                changed_at=now,
            )

            self.db.add(history)

            await self.db.commit()
            await self.db.refresh(ticket)

            return ticket

        except Exception:
            await self.db.rollback()
            raise

    async def list_tickets(
        self,
        current_user: User,
        unassigned: bool = False,
        assigned_to_me: bool = False,
    ) -> list[Ticket]:

        if current_user.role != UserRole.AGENT:
            raise PermissionError("Only agents can use this ticket queue")

        if unassigned and assigned_to_me:
            raise ValueError(
                "Choose either unassigned or assigned_to_me"
            )

        if unassigned:
            return await self.ticket_repository.list_unassigned()

        if assigned_to_me:
            return await self.ticket_repository.list_assigned_to_agent(
                current_user.id
            )

        raise ValueError(
            "Specify unassigned=true or assigned_to_me=true"
        )