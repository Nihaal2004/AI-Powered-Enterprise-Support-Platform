import asyncio
import uuid

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.agent import Agent
from app.models.user import User, UserRole


async def seed():
    async with AsyncSessionLocal() as db:
        agent_user = User(
            id=uuid.uuid4(),
            email="agent@example.com",
            name="Test Agent",
            password_hash=hash_password("AgentPass123"),
            role=UserRole.AGENT,
            is_active=True,
        )

        try:
            db.add(agent_user)
            await db.flush()

            agent = Agent(
                user_id=agent_user.id,
            )

            db.add(agent)

            await db.commit()

            print("Agent ID:", agent_user.id)

        except Exception:
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(seed())