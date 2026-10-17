import asyncio
import json
import uuid

from app.db.session import AsyncSessionLocal
from app.messaging.rabbitmq import (
    AI_QUEUE,
    get_rabbitmq_connection,
    setup_messaging,
)
from app.services.ai_suggestion_processor import (
    AISuggestionProcessor,
)


async def process_message(message):
    async with message.process():
        event = json.loads(
            message.body.decode("utf-8")
        )

        if event["event_type"] != "AI_SUGGESTION_REQUESTED":
            return

        suggestion_id = uuid.UUID(
            event["payload"]["suggestion_id"]
        )

        async with AsyncSessionLocal() as db:
            processor = AISuggestionProcessor(db)

            await processor.process(
                suggestion_id
            )

        print(
            f"Processed AI suggestion {suggestion_id}"
        )


async def main():
    connection = await get_rabbitmq_connection()

    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)

    await setup_messaging(channel)

    queue = await channel.get_queue(
        AI_QUEUE
    )

    print("AI worker waiting for jobs...")

    await queue.consume(
        process_message
    )

    try:
        await asyncio.Future()
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())