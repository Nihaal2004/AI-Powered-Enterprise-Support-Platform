from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.ticket import TicketCreate, TicketResponse
from app.services.ticket_service import TicketService
import uuid
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from fastapi import HTTPException
from app.schemas.message import MessageCreate, MessageResponse
router = APIRouter(
    prefix="/tickets",
    tags=["tickets"],
)

@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = TicketService(db)
    ticket = await service.get_ticket(ticket_id)

    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    return ticket
@router.post("", response_model=TicketResponse, status_code=201)
async def create_ticket(
    data: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.CUSTOMER:
        raise HTTPException(
            status_code=403,
            detail="Only customers can create tickets",
        )

    service = TicketService(db)

    ticket = await service.create_ticket(
        data=data,
        customer_id=current_user.id,
    )

    return ticket

@router.get(
    "/{ticket_id}/messages",
    response_model=list[MessageResponse],
)
async def get_messages(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.get_messages(
            ticket_id,
            current_user,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc

@router.post(
    "/{ticket_id}/messages",
    response_model=MessageResponse,
    status_code=201,
)
async def add_message(
    ticket_id: uuid.UUID,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.add_message(
            ticket_id=ticket_id,
            body=data.body,
            current_user=current_user,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc