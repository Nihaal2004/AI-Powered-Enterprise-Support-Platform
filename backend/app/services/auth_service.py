from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.models.customer import Customer
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repository = UserRepository(db)

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

    async def login(self, data: LoginRequest) -> tuple[User, str]:
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

        return user, access_token