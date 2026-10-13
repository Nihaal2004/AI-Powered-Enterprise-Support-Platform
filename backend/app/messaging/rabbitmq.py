import os

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


async def get_rabbitmq_connection():
    return await aio_pika.connect_robust(
        RABBITMQ_URL
    )


async def setup_messaging(channel):
    exchange = await channel.declare_exchange(
        EXCHANGE_NAME,
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

    await kb_queue.bind(
        exchange,
        routing_key="KB_DOCUMENT_UPLOADED",
    )

    await ai_queue.bind(
        exchange,
        routing_key="AI_SUGGESTION_REQUESTED",
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