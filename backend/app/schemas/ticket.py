import uuid

from pydantic import BaseModel, Field

from app.models.ticket import CustomerUrgency
from app.models.ticket import TicketStatus, TicketPriority


class TicketCreate(BaseModel):
    primary_category_id: uuid.UUID
    title: str = Field(min_length=3, max_length=255)
    initial_message: str = Field(min_length=1)
    customer_urgency: CustomerUrgency = CustomerUrgency.NORMAL


class TicketResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    assigned_agent_id: uuid.UUID | None
    primary_category_id: uuid.UUID
    title: str
    customer_urgency: CustomerUrgency
    status: str
    priority: str

    model_config = {
        "from_attributes": True
    }

class TicketStatusUpdate(BaseModel):
    status: TicketStatus


class TicketPriorityUpdate(BaseModel):
    priority: TicketPriority
    reason: str | None = None