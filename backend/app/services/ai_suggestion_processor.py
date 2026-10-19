import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion import AISuggestionStatus
from app.repositories.ai_suggestion_repository import (
    AISuggestionRepository,
)
from app.repositories.ticket_repository import TicketRepository
from app.services.knowledge_retrieval_service import (
    KnowledgeRetrievalService,
)
from app.services.llm_service import LLMService
from app.services.citation_service import CitationService


MIN_SIMILARITY = 0.45


class AISuggestionProcessor:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.suggestion_repository = AISuggestionRepository(db)
        self.ticket_repository = TicketRepository(db)
        self.retrieval_service = KnowledgeRetrievalService(db)
        self.llm_service = LLMService()

    async def process(
        self,
        suggestion_id: uuid.UUID,
    ) -> None:

        suggestion = (
            await self.suggestion_repository.get_by_id(
                suggestion_id
            )
        )

        if suggestion is None:
            raise ValueError(
                f"Suggestion {suggestion_id} not found"
            )

        # Idempotency for duplicate RabbitMQ delivery.
        if suggestion.status in {
            AISuggestionStatus.COMPLETED,
            AISuggestionStatus.STALE,
        }:
            return

        current_version = (
            await self.ticket_repository.get_conversation_version(
                suggestion.ticket_id
            )
        )

        if current_version != suggestion.conversation_version:
            suggestion.status = AISuggestionStatus.STALE
            await self.db.commit()
            return

        suggestion.status = AISuggestionStatus.PROCESSING
        await self.db.commit()

        try:
            #raise RuntimeError("TEST_RETRY_FAILURE")
            ticket = await self.ticket_repository.get_by_id(
                suggestion.ticket_id
            )

            messages = await self.ticket_repository.get_messages(
                suggestion.ticket_id
            )

            conversation_parts = [
                f"Ticket title: {ticket.title}"
            ]

            for message in messages:
                # Don't feed soft-deleted messages to the model.
                if getattr(message, "deleted_at", None):
                    continue

                message_type = message.message_type.value

                role = (
                    "Customer"
                    if message_type == "CUSTOMER_REPLY"
                    else "Support Agent"
                )

                conversation_parts.append(
                    f"{role}: {message.body}"
                )

            conversation = "\n".join(
                conversation_parts
            )

            # Retrieval query includes the ticket context.
            customer_messages = []

            for message in messages:
                if getattr(message, "deleted_at", None):
                    continue

                if message.message_type.value == "CUSTOMER_REPLY":
                    customer_messages.append(message.body)

            retrieval_query = "\n".join(
                [
                    f"Ticket title: {ticket.title}",
                    *customer_messages[-3:],
                ]
            )

            retrieval_results = await self.retrieval_service.retrieve(
                query=retrieval_query,
                top_k=8,
            )

            for chunk in retrieval_results:
                print(
                    "Retrieved chunk",
                    chunk["chunk_index"],
                    "similarity=",
                    round(chunk["similarity"], 3),
                )

            await self.db.commit()

            relevant_chunks = [
                chunk
                for chunk in retrieval_results
                if chunk["similarity"] >= MIN_SIMILARITY
            ]

            relevant_chunks = relevant_chunks[:5]

            if not relevant_chunks:
                suggestion = (
                    await self.suggestion_repository.get_by_id(
                        suggestion_id
                    )
                )

                suggestion.status = (
                    AISuggestionStatus.COMPLETED
                )
                suggestion.draft_text = (
                    "Insufficient knowledge-base evidence "
                    "to generate a grounded reply."
                )
                suggestion.citations = []
                suggestion.completed_at = datetime.now(
                    timezone.utc
                )

                await self.db.commit()
                return

            draft = await asyncio.to_thread(
                self.llm_service.generate_support_reply,
                conversation,
                relevant_chunks,
            )

            # Critical: conversation may have changed while
            # the model was generating.
            current_version = (
                await self.ticket_repository.get_conversation_version(
                    suggestion.ticket_id
                )
            )

            suggestion = (
                await self.suggestion_repository.get_by_id(
                    suggestion_id
                )
            )

            if current_version != suggestion.conversation_version:
                suggestion.status = AISuggestionStatus.STALE
                suggestion.draft_text = None
                suggestion.citations = None

                await self.db.commit()
                return

            if draft == "INSUFFICIENT_EVIDENCE":
                suggestion.draft_text = (
                    "Insufficient knowledge-base evidence "
                    "to generate a grounded reply."
                )
                suggestion.citations = []

            else:
                suggestion.draft_text = draft

                suggestion.citations = CitationService.build_citations(
                    draft_text=draft,
                    knowledge_chunks=relevant_chunks,
                )

            suggestion.status = AISuggestionStatus.COMPLETED
            suggestion.completed_at = datetime.now(
                timezone.utc
            )
            suggestion.failure_reason = None

            await self.db.commit()

        except Exception as exc:
            await self.db.rollback()
            raise