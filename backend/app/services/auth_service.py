from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)

import uuid
from datetime import datetime, timedelta, timezone

from app.models.refresh_session import RefreshSession
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.repositories.refresh_session_repository import (
    RefreshSessionRepository,
)
from app.models.customer import Customer
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repository = UserRepository(db)
        self.refresh_session_repository = RefreshSessionRepository(db)

    async def register_customer(self, data: RegisterRequest) -> User:
        existing_user = await self.user_repository.get_by_email(data.email)

        if existing_user is not None:
            raise ValueError("Email already registered")

        user = User(
            email=data.email.lower(),
            name=data.name,
            password_hash=hash_password(data.password),
            role=UserRole.CUSTOMER,
            is_active=True,
        )

        try:
            user = await self.user_repository.create(user)

            customer = Customer(
                user_id=user.id,
            )

            self.db.add(customer)

            await self.db.commit()
            await self.db.refresh(user)

            return user

        except Exception:
            await self.db.rollback()
            raise

    async def login(self, data: LoginRequest, user_agent: str | None = None, ip_address: str | None = None,
) -> tuple[User, str, str]:

        user = await self.user_repository.get_by_email(
            data.email.lower()
        )

        if user is None:
            raise ValueError("Invalid email or password")

        if not user.is_active:
            raise ValueError("Account is disabled")

        if not verify_password(
            data.password,
            user.password_hash,
        ):
            raise ValueError("Invalid email or password")

        access_token = create_access_token(
            user_id=user.id,
            role=user.role.value,
        )

        refresh_token = create_refresh_token()

        now = datetime.now(timezone.utc)

        session = RefreshSession(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            family_id=uuid.uuid4(),
            parent_session_id=None,
            replaced_by_session_id=None,
            created_at=now,
            expires_at=now + timedelta(hours=8),
            used_at=None,
            revoked_at=None,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        self.db.add(session)
        await self.db.commit()

        return user, access_token, refresh_token

    
    async def refresh(self, raw_refresh_token: str,) -> tuple[str, str]:

        now = datetime.now(timezone.utc)

        token_hash = hash_refresh_token(raw_refresh_token)

        session = (
            await self.refresh_session_repository.get_by_token_hash_for_update(
                token_hash
            )
        )

        if session is None:
            raise ValueError("Invalid refresh token")

        # Already revoked
        if session.revoked_at is not None:
            raise ValueError("Refresh session revoked")

        # Token has already been consumed -> possible token theft/reuse
        if session.used_at is not None:
            await self.refresh_session_repository.revoke_family(
                family_id=session.family_id,
                revoked_at=now,
            )

            await self.db.commit()

            raise ValueError(
                "Refresh token reuse detected"
            )

        # Absolute session lifetime
        if now >= session.expires_at:
            session.revoked_at = now
            await self.db.commit()

            raise ValueError("Refresh session expired")

        # 60 minute idle timeout
        if now >= session.created_at + timedelta(minutes=60):
            session.revoked_at = now
            await self.db.commit()

            raise ValueError("Refresh session idle timeout")

        user = await self.user_repository.get_by_id(
            session.user_id
        )

        if user is None or not user.is_active:
            session.revoked_at = now
            await self.db.commit()

            raise ValueError("User unavailable")

        new_access_token = create_access_token(
            user_id=user.id,
            role=user.role.value,
        )

        new_raw_refresh_token = create_refresh_token()

        new_session = RefreshSession(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hash_refresh_token(
                new_raw_refresh_token
            ),

            # SAME family
            family_id=session.family_id,

            # Previous token is its parent
            parent_session_id=session.id,

            replaced_by_session_id=None,

            created_at=now,

            # Important: DO NOT extend absolute 8-hour lifetime
            expires_at=session.expires_at,

            used_at=None,
            revoked_at=None,

            user_agent=session.user_agent,
            ip_address=session.ip_address,
        )

        self.db.add(new_session)

        # Force ONLY the new refresh session (R2) into PostgreSQL first
        await self.db.flush([new_session])

        # R2 now exists, so R1 can safely reference it
        session.used_at = now
        session.replaced_by_session_id = new_session.id

        # Push the R1 update
        await self.db.flush()

        # Commit both operations atomically
        await self.db.commit()

        return (
            new_access_token,
            new_raw_refresh_token,
        )