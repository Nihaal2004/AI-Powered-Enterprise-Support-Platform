"""add knowledge documents

Revision ID: c4f9ce5a2788
Revises: 4ab305cf7f9a
Create Date: 2026-10-13 13:52:43.800359
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c4f9ce5a2788"
down_revision: Union[str, Sequence[str], None] = "4ab305cf7f9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


knowledge_document_status_enum = postgresql.ENUM(
    "PENDING_UPLOAD",
    "UPLOADED",
    "PROCESSING",
    "INDEXED",
    "FAILED",
    name="knowledge_document_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    knowledge_document_status_enum.create(
        bind,
        checkfirst=True,
    )

    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "uploaded_by_user_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "original_filename",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "storage_key",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "mime_type",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "size_bytes",
            sa.BigInteger(),
            nullable=False,
        ),
        sa.Column(
            "status",
            knowledge_document_status_enum,
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "processing_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "indexed_at",
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
            ["uploaded_by_user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )

    op.create_index(
        op.f("ix_knowledge_documents_status"),
        "knowledge_documents",
        ["status"],
        unique=False,
    )

    op.create_index(
        op.f("ix_knowledge_documents_uploaded_by_user_id"),
        "knowledge_documents",
        ["uploaded_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_knowledge_documents_uploaded_by_user_id"),
        table_name="knowledge_documents",
    )

    op.drop_index(
        op.f("ix_knowledge_documents_status"),
        table_name="knowledge_documents",
    )

    op.drop_table("knowledge_documents")

    bind = op.get_bind()

    knowledge_document_status_enum.drop(
        bind,
        checkfirst=True,
    )