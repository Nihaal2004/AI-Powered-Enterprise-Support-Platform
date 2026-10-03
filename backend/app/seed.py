import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.customer import Customer
from app.models.ticket_category import TicketCategory
from app.models.user import User, UserRole


async def seed():
    async with AsyncSessionLocal() as db:
        customer_user = User(
            id=uuid.uuid4(),
            email="customer@example.com",
            name="Test Customer",
            password_hash="not-real-yet",
            role=UserRole.CUSTOMER,
            is_active=True,
        )

        db.add(customer_user)
        await db.flush()

        customer = Customer(
            user_id=customer_user.id,
        )

        category = TicketCategory(
            id=uuid.uuid4(),
            name="Technical Support",
            description="Technical issues",
            is_active=True,
        )

        db.add(customer)
        db.add(category)

        await db.commit()

        print("Customer ID:", customer_user.id)
        print("Category ID:", category.id)


if __name__ == "__main__":
    asyncio.run(seed())