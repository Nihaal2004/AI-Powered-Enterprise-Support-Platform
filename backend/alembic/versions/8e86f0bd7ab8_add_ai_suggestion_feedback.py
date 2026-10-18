"""add ai suggestion feedback

Revision ID: 8e86f0bd7ab8
Revises: 0f4145b70c43
Create Date: 2026-10-18 06:53:27.830738
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "8e86f0bd7ab8"
down_revision: Union[str, Sequence[str], None] = "0f4145b70c43"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ai_suggestion_feedback_type = postgresql.ENUM(
    "ACCEPTED",
    "EDITED",
    "REJECTED",
    name="ai_suggestion_feedback_type",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    ai_suggestion_feedback_type.create(
        bind,
        checkfirst=True,
    )

    op.create_table(
        "ai_suggestion_feedback",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "suggestion_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "feedback_by_user_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "feedback_type",
            ai_suggestion_feedback_type,
            nullable=False,
        ),
        sa.Column(
            "final_text",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["feedback_by_user_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["suggestion_id"],
            ["ai_suggestions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "suggestion_id",
            name="uq_ai_suggestion_feedback_suggestion_id",
        ),
    )

    op.create_index(
        op.f("ix_ai_suggestion_feedback_feedback_by_user_id"),
        "ai_suggestion_feedback",
        ["feedback_by_user_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_ai_suggestion_feedback_feedback_type"),
        "ai_suggestion_feedback",
        ["feedback_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_suggestion_feedback_feedback_type"),
        table_name="ai_suggestion_feedback",
    )

    op.drop_index(
        op.f("ix_ai_suggestion_feedback_feedback_by_user_id"),
        table_name="ai_suggestion_feedback",
    )

    op.drop_table(
        "ai_suggestion_feedback"
    )

    bind = op.get_bind()

    ai_suggestion_feedback_type.drop(
        bind,
        checkfirst=True,
    )