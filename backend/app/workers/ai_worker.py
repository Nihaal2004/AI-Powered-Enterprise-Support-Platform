import asyncio
import json
import uuid
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal
from app.messaging.rabbitmq import (
    AI_QUEUE,
    AI_RETRY_KEY,
    AI_DLQ_KEY,
    get_rabbitmq_connection,
    republish_failed_message,
    setup_messaging,
)
from app.models.ai_suggestion import AISuggestionStatus
from app.repositories.ai_suggestion_repository import (
    AISuggestionRepository,
)
from app.services.ai_suggestion_processor import (
    AISuggestionProcessor,
)


async def mark_suggestion_failed(
    suggestion_id: uuid.UUID,
    error: Exception,
) -> None:
    async with AsyncSessionLocal() as db:
        repository = AISuggestionRepository(db)

        suggestion = await repository.get_by_id(
            suggestion_id
        )

        if suggestion is None:
            return

        # Do not overwrite a terminal successful/stale result.
        if suggestion.status in {
            AISuggestionStatus.COMPLETED,
            AISuggestionStatus.STALE,
        }:
            return

        suggestion.status = AISuggestionStatus.FAILED
        suggestion.failed_at = datetime.now(
            timezone.utc
        )
        suggestion.failure_reason = str(error)[:2000]

        await db.commit()


async def process_message(message, channel):
    suggestion_id = None

    try:
        event = json.loads(
            message.body.decode("utf-8")
        )

        if event["event_type"] != "AI_SUGGESTION_REQUESTED":
            await message.ack()
            return

        suggestion_id = uuid.UUID(
            event["payload"]["suggestion_id"]
        )

        async with AsyncSessionLocal() as db:
            processor = AISuggestionProcessor(db)
            await processor.process(suggestion_id)

        await message.ack()

        print(
            f"Processed AI suggestion {suggestion_id}"
        )

    except Exception as exc:
        try:
            action = await republish_failed_message(
                channel,          # <-- real aio_pika channel
                message,
                retry_key=AI_RETRY_KEY,
                dlq_key=AI_DLQ_KEY,
            )

        except Exception:
            await message.nack(requeue=True)
            raise

        if action == "DLQ":
            if suggestion_id is not None:
                await mark_suggestion_failed(
                    suggestion_id,
                    exc,
                )

            print(
                f"AI suggestion {suggestion_id} exhausted retries; "
                "moved to DLQ"
            )

        else:
            print(
                f"AI suggestion {suggestion_id} failed; "
                "scheduled for retry"
            )

        await message.ack()


async def main():
    connection = await get_rabbitmq_connection()

    try:
        channel = await connection.channel()

        await channel.set_qos(
            prefetch_count=1
        )

        await setup_messaging(channel)

        queue = await channel.get_queue(
            AI_QUEUE
        )

        print("AI worker waiting for jobs...")

        async def callback(message):
            await process_message(
                message,
                channel,
            )

        await queue.consume(
            callback
        )

        await asyncio.Future()

    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())