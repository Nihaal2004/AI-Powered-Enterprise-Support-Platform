from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.services.knowledge_retrieval_service import KnowledgeRetrievalService


router = APIRouter(
    prefix="/knowledge-search",
    tags=["knowledge-search"],
)


@router.get("")
async def search_knowledge(
    query: str = Query(..., min_length=1),
    top_k: int = Query(5, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {
        UserRole.AGENT,
        UserRole.ADMIN,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent or admin access required",
        )

    service = KnowledgeRetrievalService(db)

    return await service.retrieve(
        query=query,
        top_k=top_k,
    )