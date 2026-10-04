from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_session import RefreshSession


class RefreshSessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_token_hash_for_update(
        self,
        token_hash: str,
    ) -> RefreshSession | None:
        result = await self.db.execute(
            select(RefreshSession)
            .where(RefreshSession.token_hash == token_hash)
            .with_for_update()
        )

        return result.scalar_one_or_none()

    async def revoke_family(
        self,
        family_id,
        revoked_at,
    ) -> None:
        await self.db.execute(
            update(RefreshSession)
            .where(RefreshSession.family_id == family_id)
            .where(RefreshSession.revoked_at.is_(None))
            .values(revoked_at=revoked_at)
        )