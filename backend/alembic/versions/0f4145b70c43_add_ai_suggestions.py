"""add ai suggestions

Revision ID: 0f4145b70c43
Revises: 42852052a815
Create Date: 2026-10-17 07:40:50.157409
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0f4145b70c43"
down_revision: Union[str, Sequence[str], None] = "42852052a815"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ai_suggestion_status = postgresql.ENUM(
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "STALE",
    name="ai_suggestion_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    ai_suggestion_status.create(
        bind,
        checkfirst=True,
    )

    op.create_table(
        "ai_suggestions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticket_id", sa.UUID(), nullable=False),
        sa.Column(
            "requested_by_user_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "conversation_version",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "status",
            ai_suggestion_status,
            nullable=False,
        ),
        sa.Column(
            "draft_text",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "citations",
            postgresql.JSONB(
                astext_type=sa.Text()
            ),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "failed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "failure_reason",
            sa.Text(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["tickets.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_ai_suggestions_requested_by_user_id"),
        "ai_suggestions",
        ["requested_by_user_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_ai_suggestions_status"),
        "ai_suggestions",
        ["status"],
        unique=False,
    )

    op.create_index(
        op.f("ix_ai_suggestions_ticket_id"),
        "ai_suggestions",
        ["ticket_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_suggestions_ticket_id"),
        table_name="ai_suggestions",
    )

    op.drop_index(
        op.f("ix_ai_suggestions_status"),
        table_name="ai_suggestions",
    )

    op.drop_index(
        op.f("ix_ai_suggestions_requested_by_user_id"),
        table_name="ai_suggestions",
    )

    op.drop_table("ai_suggestions")

    bind = op.get_bind()

    ai_suggestion_status.drop(
        bind,
        checkfirst=True,
    )