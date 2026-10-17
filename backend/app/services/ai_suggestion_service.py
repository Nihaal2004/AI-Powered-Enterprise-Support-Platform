import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion import (
    AISuggestion,
    AISuggestionStatus,
)
from app.models.ticket import TicketStatus
from app.models.user import User, UserRole
from app.repositories.ai_suggestion_repository import (
    AISuggestionRepository,
)
from app.repositories.ticket_repository import TicketRepository
from app.services.outbox_service import OutboxService


class AISuggestionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.ticket_repository = TicketRepository(db)
        self.suggestion_repository = AISuggestionRepository(db)
        self.outbox_service = OutboxService(db)

    async def request_suggestion(
        self,
        ticket_id: uuid.UUID,
        current_user: User,
    ) -> AISuggestion:

        if current_user.role != UserRole.AGENT:
            raise HTTPException(
                status_code=403,
                detail="Only support agents can request AI suggestions",
            )

        ticket = await self.ticket_repository.get_by_id(
            ticket_id
        )

        if ticket is None:
            raise HTTPException(
                status_code=404,
                detail="Ticket not found",
            )

        if ticket.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Only the assigned agent can request AI suggestions",
            )

        if ticket.status in {
            TicketStatus.RESOLVED,
            TicketStatus.CLOSED,
        }:
            raise HTTPException(
                status_code=409,
                detail="AI suggestions are unavailable for resolved or closed tickets",
            )

        suggestion = AISuggestion(
            ticket_id=ticket.id,
            requested_by_user_id=current_user.id,
            conversation_version=ticket.conversation_version,
            status=AISuggestionStatus.PENDING,
            created_at=datetime.now(timezone.utc),
        )

        await self.suggestion_repository.create(
            suggestion
        )

        await self.outbox_service.add_event(
            event_type="AI_SUGGESTION_REQUESTED",
            aggregate_type="AI_SUGGESTION",
            aggregate_id=suggestion.id,
            payload={
                "suggestion_id": str(suggestion.id),
                "ticket_id": str(ticket.id),
                "conversation_version": ticket.conversation_version,
            },
        )

        # Suggestion + outbox event commit atomically.
        await self.db.commit()
        await self.db.refresh(suggestion)

        return suggestion

    async def get_suggestion(
        self,
        suggestion_id: uuid.UUID,
        current_user: User,
    ) -> AISuggestion:

        suggestion = await self.suggestion_repository.get_by_id(
            suggestion_id
        )

        if suggestion is None:
            raise HTTPException(
                status_code=404,
                detail="AI suggestion not found",
            )

        if current_user.role != UserRole.AGENT:
            raise HTTPException(
                status_code=403,
                detail="Only support agents can access AI suggestions",
            )

        if suggestion.requested_by_user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot access this AI suggestion",
            )

        return suggestion