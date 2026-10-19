import os
import asyncio
import aio_pika
from aio_pika import (
    DeliveryMode,
    ExchangeType,
    Message,
)


RABBITMQ_URL = os.environ["RABBITMQ_URL"]

EXCHANGE_NAME = "support.events"

KB_QUEUE = "kb.ingestion"
AI_QUEUE = "ai.suggestions"

RETRY_EXCHANGE_NAME = "support.retry"
DLX_EXCHANGE_NAME = "support.dlx"

KB_RETRY_QUEUE = "kb.ingestion.retry"
AI_RETRY_QUEUE = "ai.suggestions.retry"

KB_DLQ = "kb.ingestion.dlq"
AI_DLQ = "ai.suggestions.dlq"

KB_RETRY_KEY = "kb.retry"
AI_RETRY_KEY = "ai.retry"

KB_DLQ_KEY = "kb.dead"
AI_DLQ_KEY = "ai.dead"

MAX_CONSUMER_RETRIES = 3
RETRY_DELAY_MS = 10_000

def get_retry_count(message) -> int:
    headers = message.headers or {}

    try:
        return int(headers.get("x-retry-count", 0))
    except (TypeError, ValueError):
        return 0

async def republish_failed_message(
    channel,
    message,
    *,
    retry_key: str,
    dlq_key: str,
) -> str:
    retry_count = get_retry_count(message)

    print(
        f"Consumer retry_count={retry_count}, "
        f"headers={message.headers}"
    )

    headers = dict(message.headers or {})

    if retry_count < MAX_CONSUMER_RETRIES:
        headers["x-retry-count"] = retry_count + 1

        retry_exchange = await channel.declare_exchange(
            RETRY_EXCHANGE_NAME,
            ExchangeType.DIRECT,
            durable=True,
        )

        await retry_exchange.publish(
            Message(
                body=message.body,
                headers=headers,
                delivery_mode=DeliveryMode.PERSISTENT,
                content_type=message.content_type
                or "application/json",
                correlation_id=message.correlation_id,
            ),
            routing_key=retry_key,
        )

        print(
            f"Republished for retry "
            f"{retry_count + 1}/{MAX_CONSUMER_RETRIES}"
        )

        return "RETRY"

    dlx_exchange = await channel.declare_exchange(
        DLX_EXCHANGE_NAME,
        ExchangeType.DIRECT,
        durable=True,
    )

    await dlx_exchange.publish(
        Message(
            body=message.body,
            headers=headers,
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type=message.content_type
            or "application/json",
            correlation_id=message.correlation_id,
        ),
        routing_key=dlq_key,
    )

    print("Retry limit exhausted; moved message to DLQ")

    return "DLQ"

async def publish_event_on_exchange(
    exchange,
    routing_key: str,
    body: bytes,
) -> None:
    await exchange.publish(
        Message(
            body=body,
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        ),
        routing_key=routing_key,
    )


async def get_rabbitmq_connection():
    delay = 2

    while True:
        try:
            connection = await aio_pika.connect_robust(
                RABBITMQ_URL
            )

            print("Connected to RabbitMQ")
            return connection

        except asyncio.CancelledError:
            raise

        except Exception as exc:
            print(
                f"RabbitMQ connection failed: {exc}. "
                f"Retrying in {delay}s..."
            )

            await asyncio.sleep(delay)

            delay = min(delay * 2, 30)

async def setup_messaging(channel):
    exchange = await channel.declare_exchange(
        EXCHANGE_NAME,
        ExchangeType.DIRECT,
        durable=True,
    )

    retry_exchange = await channel.declare_exchange(
        RETRY_EXCHANGE_NAME,
        ExchangeType.DIRECT,
        durable=True,
    )

    dlx_exchange = await channel.declare_exchange(
        DLX_EXCHANGE_NAME,
        ExchangeType.DIRECT,
        durable=True,
    )

    kb_queue = await channel.declare_queue(
        KB_QUEUE,
        durable=True,
    )

    ai_queue = await channel.declare_queue(
        AI_QUEUE,
        durable=True,
    )

    kb_retry_queue = await channel.declare_queue(
        KB_RETRY_QUEUE,
        durable=True,
        arguments={
            "x-message-ttl": RETRY_DELAY_MS,
            "x-dead-letter-exchange": EXCHANGE_NAME,
            "x-dead-letter-routing-key": "KB_DOCUMENT_UPLOADED",
        },
    )

    ai_retry_queue = await channel.declare_queue(
        AI_RETRY_QUEUE,
        durable=True,
        arguments={
            "x-message-ttl": RETRY_DELAY_MS,
            "x-dead-letter-exchange": EXCHANGE_NAME,
            "x-dead-letter-routing-key": "AI_SUGGESTION_REQUESTED",
        },
    )

    kb_dlq = await channel.declare_queue(
        KB_DLQ,
        durable=True,
    )

    ai_dlq = await channel.declare_queue(
        AI_DLQ,
        durable=True,
    )

    await kb_queue.bind(
        exchange,
        routing_key="KB_DOCUMENT_UPLOADED",
    )

    await ai_queue.bind(
        exchange,
        routing_key="AI_SUGGESTION_REQUESTED",
    )

    await kb_retry_queue.bind(
        retry_exchange,
        routing_key=KB_RETRY_KEY,
    )

    await ai_retry_queue.bind(
        retry_exchange,
        routing_key=AI_RETRY_KEY,
    )

    await kb_dlq.bind(
        dlx_exchange,
        routing_key=KB_DLQ_KEY,
    )

    await ai_dlq.bind(
        dlx_exchange,
        routing_key=AI_DLQ_KEY,
    )

    return exchange

async def publish_event(
    routing_key: str,
    body: bytes,
) -> None:
    connection = await get_rabbitmq_connection()

    try:
        channel = await connection.channel()

        exchange = await setup_messaging(channel)

        await exchange.publish(
            Message(
                body=body,
                delivery_mode=DeliveryMode.PERSISTENT,
                content_type="application/json",
            ),
            routing_key=routing_key,
        )

    finally:
        await connection.close()