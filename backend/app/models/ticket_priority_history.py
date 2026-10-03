# backend/app/models/ticket_priority_history.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.ticket import TicketPriority


class TicketPriorityHistory(Base):
    __tablename__ = "ticket_priority_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False, index=True)
    old_priority: Mapped[TicketPriority] = mapped_column(Enum(TicketPriority, name="ticket_priority"), nullable=False)
    new_priority: Mapped[TicketPriority] = mapped_column(Enum(TicketPriority, name="ticket_priority"), nullable=False)
    changed_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)