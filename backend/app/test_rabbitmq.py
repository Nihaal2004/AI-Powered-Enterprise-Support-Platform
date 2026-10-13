import asyncio

from app.messaging.rabbitmq import get_rabbitmq_connection


async def main():
    connection = await get_rabbitmq_connection()

    print("RabbitMQ connection successful")

    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())