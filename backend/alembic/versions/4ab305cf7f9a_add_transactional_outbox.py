"""add transactional outbox

Revision ID: 4ab305cf7f9a
Revises: 47e7f5a8fac0
Create Date: 2026-10-13 11:57:21.322912
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "4ab305cf7f9a"
down_revision: Union[str, Sequence[str], None] = "47e7f5a8fac0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


outbox_status_enum = postgresql.ENUM(
    "PENDING",
    "PUBLISHED",
    "FAILED",
    name="outbox_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    outbox_status_enum.create(
        bind,
        checkfirst=True,
    )

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_id", sa.UUID(), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "status",
            outbox_status_enum,
            nullable=False,
        ),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column(
            "available_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "last_error",
            sa.Text(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        op.f("ix_outbox_events_aggregate_id"),
        "outbox_events",
        ["aggregate_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_outbox_events_event_type"),
        "outbox_events",
        ["event_type"],
        unique=False,
    )

    op.create_index(
        op.f("ix_outbox_events_status"),
        "outbox_events",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_outbox_events_status"),
        table_name="outbox_events",
    )

    op.drop_index(
        op.f("ix_outbox_events_event_type"),
        table_name="outbox_events",
    )

    op.drop_index(
        op.f("ix_outbox_events_aggregate_id"),
        table_name="outbox_events",
    )

    op.drop_table("outbox_events")

    bind = op.get_bind()

    outbox_status_enum.drop(
        bind,
        checkfirst=True,
    )