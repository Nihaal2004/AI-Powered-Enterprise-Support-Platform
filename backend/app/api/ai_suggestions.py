import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_suggestion import AISuggestionResponse
from app.services.ai_suggestion_service import AISuggestionService


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