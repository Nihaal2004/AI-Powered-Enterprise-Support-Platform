import asyncio
import json

from app.messaging.rabbitmq import (
    KB_QUEUE,
    get_rabbitmq_connection,
    setup_messaging,
)


async def process_message(message):
    async with message.process():
        event = json.loads(
            message.body.decode("utf-8")
        )

        print(
            "KB worker received:",
            event,
        )

        # Actual ingestion comes next.
        #
        # Later:
        # document_id
        # → download file
        # → extract text
        # → chunk
        # → embed
        # → pgvector


async def main():
    connection = await get_rabbitmq_connection()

    channel = await connection.channel()

    # Don't give this worker unlimited jobs at once.
    await channel.set_qos(
        prefetch_count=5
    )

    await setup_messaging(channel)

    queue = await channel.get_queue(
        KB_QUEUE
    )

    print("KB worker waiting for jobs...")

    await queue.consume(
        process_message
    )

    try:
        await asyncio.Future()

    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())