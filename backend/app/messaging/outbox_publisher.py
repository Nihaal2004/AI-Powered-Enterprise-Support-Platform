import asyncio
import json

from app.db.session import AsyncSessionLocal
from app.messaging.rabbitmq import (
    get_rabbitmq_connection,
    setup_messaging,
    publish_event_on_exchange,
)
from app.repositories.outbox_repository import OutboxRepository


async def publish_pending_events(exchange):
    async with AsyncSessionLocal() as db:
        repository = OutboxRepository(db)

        events = await repository.get_pending_batch(limit=20)

        if not events:
            await db.rollback()
            return 0

        published_count = 0

        for event in events:
            try:
                body = json.dumps(
                    {
                        "event_id": str(event.id),
                        "event_type": event.event_type,
                        "aggregate_type": event.aggregate_type,
                        "aggregate_id": str(event.aggregate_id),
                        "payload": event.payload,
                        "created_at": event.created_at.isoformat(),
                    }
                ).encode("utf-8")

                await publish_event_on_exchange(
                    exchange=exchange,
                    routing_key=event.event_type,
                    body=body,
                )

                await repository.mark_published(event)
                published_count += 1

            except Exception as exc:
                await repository.mark_retry(
                    event,
                    str(exc),
                )

        await db.commit()

        return published_count


async def run_forever():
    connection = await get_rabbitmq_connection()

    try:
        channel = await connection.channel()

        exchange = await setup_messaging(channel)

        print("Outbox publisher connected to RabbitMQ")

        while True:
            try:
                count = await publish_pending_events(exchange)

                if count:
                    print(
                        f"Published {count} outbox event(s)"
                    )

            except Exception as exc:
                print(
                    f"Outbox publisher error: {exc}"
                )

            await asyncio.sleep(2)

    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(run_forever())