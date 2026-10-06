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
from app.schemas.ticket import TicketStatusUpdate, TicketPriorityUpdate
from app.schemas.internal_note import (
    InternalNoteCreate,
    InternalNoteResponse,
)
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

@router.post(
    "/{ticket_id}/claim",
    response_model=TicketResponse,
)
async def claim_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.claim_ticket(
            ticket_id=ticket_id,
            current_user=current_user,
        )

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

@router.get(
    "",
    response_model=list[TicketResponse],
)
async def list_tickets(
    unassigned: bool = False,
    assigned_to_me: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.list_tickets(
            current_user=current_user,
            unassigned=unassigned,
            assigned_to_me=assigned_to_me,
        )

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

@router.patch(
    "/{ticket_id}/status",
    response_model=TicketResponse,
)
async def update_status(
    ticket_id: uuid.UUID,
    data: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.update_status(
            ticket_id=ticket_id,
            new_status=data.status,
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

    except RuntimeError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc

@router.patch(
    "/{ticket_id}/priority",
    response_model=TicketResponse,
)
async def update_priority(
    ticket_id: uuid.UUID,
    data: TicketPriorityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.update_priority(
            ticket_id=ticket_id,
            new_priority=data.priority,
            reason=data.reason,
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


@router.get(
    "/{ticket_id}/internal-notes",
    response_model=list[InternalNoteResponse],
)
async def get_internal_notes(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.get_internal_notes(
            ticket_id=ticket_id,
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

@router.post(
    "/{ticket_id}/internal-notes",
    response_model=InternalNoteResponse,
    status_code=201,
)
async def add_internal_note(
    ticket_id: uuid.UUID,
    data: InternalNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = TicketService(db)

    try:
        return await service.add_internal_note(
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