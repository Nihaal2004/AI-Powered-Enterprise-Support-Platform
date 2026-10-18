import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion import AISuggestionStatus
from app.models.ai_suggestion_feedback import (
    AISuggestionFeedback,
    AISuggestionFeedbackType,
)
from app.models.user import User, UserRole
from app.repositories.ai_suggestion_feedback_repository import (
    AISuggestionFeedbackRepository,
)
from app.repositories.ai_suggestion_repository import (
    AISuggestionRepository,
)
from app.repositories.ticket_repository import TicketRepository
from app.services.ticket_service import TicketService
from app.services.citation_service import CitationService


class AISuggestionFeedbackService:
    def __init__(self, db: AsyncSession):
        self.db = db

        self.feedback_repository = (
            AISuggestionFeedbackRepository(db)
        )
        self.suggestion_repository = AISuggestionRepository(db)
        self.ticket_repository = TicketRepository(db)
        self.ticket_service = TicketService(db)

    async def submit_feedback(
        self,
        suggestion_id: uuid.UUID,
        feedback_type: AISuggestionFeedbackType,
        final_text: str | None,
        current_user: User,
    ) -> AISuggestionFeedback:

        if current_user.role != UserRole.AGENT:
            raise HTTPException(
                status_code=403,
                detail="Only support agents can submit AI feedback",
            )

        suggestion = await self.suggestion_repository.get_by_id(
            suggestion_id
        )

        if suggestion is None:
            raise HTTPException(
                status_code=404,
                detail="AI suggestion not found",
            )

        if suggestion.requested_by_user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot provide feedback for this suggestion",
            )

        if suggestion.status != AISuggestionStatus.COMPLETED:
            raise HTTPException(
                status_code=409,
                detail="Feedback can only be submitted for completed suggestions",
            )

        existing = (
            await self.feedback_repository.get_by_suggestion_id(
                suggestion_id
            )
        )

        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Feedback has already been submitted",
            )

        current_version = (
            await self.ticket_repository.get_conversation_version(
                suggestion.ticket_id
            )
        )

        if current_version != suggestion.conversation_version:
            suggestion.status = AISuggestionStatus.STALE
            await self.db.commit()

            raise HTTPException(
                status_code=409,
                detail="Suggestion is stale because the conversation has changed",
            )

        if feedback_type == AISuggestionFeedbackType.ACCEPTED:
            if final_text is not None:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "ACCEPTED must not include final_text. "
                        "Use EDITED to modify the AI suggestion."
                    ),
                )

            final_text = suggestion.draft_text

        elif feedback_type == AISuggestionFeedbackType.EDITED:
            if not final_text or not final_text.strip():
                raise HTTPException(
                    status_code=422,
                    detail="Edited feedback requires final_text",
                )

            final_text = final_text.strip()

        elif feedback_type == AISuggestionFeedbackType.REJECTED:
            final_text = None

        feedback = AISuggestionFeedback(
            suggestion_id=suggestion.id,
            feedback_by_user_id=current_user.id,
            feedback_type=feedback_type,
            final_text=final_text,
            created_at=datetime.now(timezone.utc),
        )

        try:
            # ACCEPTED / EDITED becomes an actual customer-visible
            # agent reply.
            
            if feedback_type in {
                AISuggestionFeedbackType.ACCEPTED,
                AISuggestionFeedbackType.EDITED,
            }:
                final_text = CitationService.strip_citations(final_text)
                await self.ticket_service._add_message_no_commit(
                    ticket_id=suggestion.ticket_id,
                    body=final_text,
                    current_user=current_user,
                )

            # REJECTED creates no ticket message.
            await self.feedback_repository.create(feedback)

            # Agent reply + conversation_version + feedback
            # commit together.
            await self.db.commit()
            await self.db.refresh(feedback)

            return feedback

        except Exception:
            await self.db.rollback()
            raise