import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.knowledge_document import (
    KnowledgeDocumentResponse,
    KnowledgeDocumentUploadRequest,
    KnowledgeDocumentUploadResponse,
)
from app.services.knowledge_document_service import (
    KnowledgeDocumentService,
)


router = APIRouter(
    prefix="/knowledge-documents",
    tags=["Knowledge Base"],
)

@router.post(
    "/presign",
    response_model=KnowledgeDocumentUploadResponse,
    status_code=201,
)
async def create_knowledge_upload(
    data: KnowledgeDocumentUploadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = KnowledgeDocumentService(db)

    try:
        document, upload_url = await service.create_upload(
            filename=data.filename,
            mime_type=data.mime_type,
            size_bytes=data.size_bytes,
            current_user=current_user,
        )

        return KnowledgeDocumentUploadResponse(
            document_id=document.id,
            upload_url=upload_url,
            storage_key=document.storage_key,
            expires_in=300,
        )

    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from exc

@router.post(
    "/{document_id}/confirm",
    response_model=KnowledgeDocumentResponse,
)
async def confirm_knowledge_upload(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = KnowledgeDocumentService(db)

    try:
        return await service.confirm_upload(
            document_id=document_id,
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