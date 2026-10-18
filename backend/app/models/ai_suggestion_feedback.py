import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AISuggestionFeedbackType(str, enum.Enum):
    ACCEPTED = "ACCEPTED"
    EDITED = "EDITED"
    REJECTED = "REJECTED"


class AISuggestionFeedback(Base):
    __tablename__ = "ai_suggestion_feedback"

    __table_args__ = (
        UniqueConstraint(
            "suggestion_id",
            name="uq_ai_suggestion_feedback_suggestion_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    suggestion_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "ai_suggestions.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    feedback_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    feedback_type: Mapped[AISuggestionFeedbackType] = mapped_column(
        Enum(
            AISuggestionFeedbackType,
            name="ai_suggestion_feedback_type",
        ),
        nullable=False,
        index=True,
    )

    final_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )