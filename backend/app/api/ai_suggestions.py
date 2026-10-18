import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_suggestion import AISuggestionResponse
from app.services.ai_suggestion_service import AISuggestionService
from app.schemas.ai_suggestion_feedback import (
    AISuggestionFeedbackRequest,
    AISuggestionFeedbackResponse,
)
from app.services.ai_suggestion_feedback_service import (
    AISuggestionFeedbackService,
)



router = APIRouter(tags=["ai-suggestions"])


@router.post(
    "/tickets/{ticket_id}/ai-suggestions",
    response_model=AISuggestionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_ai_suggestion(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = AISuggestionService(db)

    return await service.request_suggestion(
        ticket_id=ticket_id,
        current_user=current_user,
    )


@router.get(
    "/ai-suggestions/{suggestion_id}",
    response_model=AISuggestionResponse,
)
async def get_ai_suggestion(
    suggestion_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = AISuggestionService(db)

    return await service.get_suggestion(
        suggestion_id=suggestion_id,
        current_user=current_user,
    )

@router.post(
    "/ai-suggestions/{suggestion_id}/feedback",
    response_model=AISuggestionFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_ai_suggestion_feedback(
    suggestion_id: uuid.UUID,
    payload: AISuggestionFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = AISuggestionFeedbackService(db)

    return await service.submit_feedback(
        suggestion_id=suggestion_id,
        feedback_type=payload.feedback_type,
        final_text=payload.final_text,
        current_user=current_user,
    )