import asyncio
import uuid

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole


async def seed():
    async with AsyncSessionLocal() as db:
        admin_user = User(
            id=uuid.uuid4(),
            email="admin@example.com",
            name="Test Admin",
            password_hash=hash_password("AdminPass123"),
            role=UserRole.ADMIN,
            is_active=True,
        )

        try:
            db.add(admin_user)
            await db.commit()

            print("Admin ID:", admin_user.id)

        except Exception:
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(seed())