"""Phase 2 real API contract checks; all fixture writes roll back.
Get-Content -Raw tests/agent_phase2_api.py | docker exec -i -e PYTHONDONTWRITEBYTECODE=1 enterprisesupportplatform-backend-1 python -
Worker result states are deterministic fixtures; no Gemini calls or RabbitMQ delivery.
"""
import asyncio
import secrets
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.db.session import engine, get_db
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_category import TicketCategory
from app.models.ai_suggestion import AISuggestion, AISuggestionStatus
from app.models.outbox_event import OutboxEvent
from app.services.citation_service import CitationService


async def main():
    async with engine.connect() as connection:
        outer = await connection.begin()
        db = AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode='create_savepoint')
        async def test_db():
            yield db
        app.dependency_overrides[get_db] = test_db
        try:
            suffix = uuid.uuid4().hex
            password = secrets.token_urlsafe(24)
            agent = User(id=uuid.uuid4(), name='Phase 2 Agent', email=f'agent-{suffix}@example.com', password_hash=hash_password(password), role=UserRole.AGENT)
            customer = User(id=uuid.uuid4(), name='Phase 2 Customer', email=f'customer-{suffix}@example.com', password_hash=hash_password(password), role=UserRole.CUSTOMER)
            category = TicketCategory(id=uuid.uuid4(), name=f'Phase 2 {suffix}')
            db.add_all([agent, customer, category])
            await db.flush()
            db.add_all([Agent(user_id=agent.id), Customer(user_id=customer.id)])
            await db.commit()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as browser:
                async def login(user):
                    result = await browser.post('/auth/login', json={'email': user.email, 'password': password})
                    assert result.status_code == 200, result.text
                    return {'Authorization': 'Bearer ' + result.json()['access_token']}
                customer_headers = await login(customer)
                created = await browser.post('/tickets', headers=customer_headers, json={'primary_category_id': str(category.id), 'title': 'Phase 2 integration', 'initial_message': 'Please explain the policy.'})
                assert created.status_code == 201, created.text
                ticket_id = created.json()['id']
                headers = await login(agent)
                path = f'/tickets/{ticket_id}/ai-suggestions'
                assert (await browser.post(path, headers=customer_headers)).status_code == 403
                assert (await browser.post(path, headers=headers)).status_code == 403
                assert (await browser.post(f'/tickets/{ticket_id}/claim', headers=headers)).status_code == 200
                ticket = await db.get(Ticket, uuid.UUID(ticket_id))
                async def request_suggestion():
                    result = await browser.post(path, headers=headers)
                    assert result.status_code == 202, result.text
                    data = result.json()
                    assert data['status'] == 'PENDING'
                    assert data['conversation_version'] == ticket.conversation_version
                    assert data['draft_text'] is None and data['citations'] is None
                    row = await db.get(AISuggestion, uuid.UUID(data['id']))
                    event = (await db.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == row.id))).scalar_one()
                    assert event.event_type == 'AI_SUGGESTION_REQUESTED'
                    return row
                async def completed():
                    row = await request_suggestion()
                    row.status = AISuggestionStatus.PROCESSING
                    await db.commit()
                    assert (await browser.get(f'/ai-suggestions/{row.id}', headers=headers)).json()['status'] == 'PROCESSING'
                    row.status = AISuggestionStatus.COMPLETED
                    row.draft_text = 'Follow this policy [2].'
                    chunks = [{'chunk_id': str(uuid.uuid4()), 'document_id': str(uuid.uuid4()), 'chunk_index': i, 'page_number': 4 if i else None, 'similarity': .8} for i in range(2)]
                    row.citations = CitationService.build_citations(row.draft_text, chunks)
                    row.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    data = (await browser.get(f'/ai-suggestions/{row.id}', headers=headers)).json()
                    assert data['status'] == 'COMPLETED' and data['citations'][0]['citation'] == 2
                    assert len(data['citations']) == 1
                    return row
                async def messages():
                    result = await browser.get(f'/tickets/{ticket_id}/messages', headers=headers)
                    assert result.status_code == 200, result.text
                    return result.json()
                accepted = await completed()
                assert (await browser.get(f'/ai-suggestions/{accepted.id}', headers=customer_headers)).status_code == 403
                assert (await browser.post(f'/ai-suggestions/{accepted.id}/feedback', headers=headers, json={'feedback_type': 'ACCEPTED', 'final_text': 'Forbidden'})).status_code == 422
                before_version = ticket.conversation_version
                before_count = len(await messages())
                result = await browser.post(f'/ai-suggestions/{accepted.id}/feedback', headers=headers, json={'feedback_type': 'ACCEPTED'})
                assert result.status_code == 201, result.text
                conversation = await messages()
                assert len(conversation) == before_count + 1
                assert conversation[-1]['body'] == 'Follow this policy.'
                assert conversation[-1]['message_type'] == 'AGENT_REPLY'
                assert ticket.conversation_version == before_version + 1
                assert (await browser.post(f'/ai-suggestions/{accepted.id}/feedback', headers=headers, json={'feedback_type': 'ACCEPTED'})).status_code == 409
                edited = await completed()
                assert (await browser.post(f'/ai-suggestions/{edited.id}/feedback', headers=headers, json={'feedback_type': 'EDITED', 'final_text': '   '})).status_code == 422
                result = await browser.post(f'/ai-suggestions/{edited.id}/feedback', headers=headers, json={'feedback_type': 'EDITED', 'final_text': 'The edited policy [2].'})
                assert result.status_code == 201, result.text
                assert (await messages())[-1]['body'] == 'The edited policy.'
                rejected = await completed()
                before_count = len(await messages())
                before_version = ticket.conversation_version
                result = await browser.post(f'/ai-suggestions/{rejected.id}/feedback', headers=headers, json={'feedback_type': 'REJECTED'})
                assert result.status_code == 201, result.text
                assert result.json()['final_text'] is None
                assert len(await messages()) == before_count
                assert ticket.conversation_version == before_version
                stale = await completed()
                assert (await browser.post(f'/tickets/{ticket_id}/messages', headers=customer_headers, json={'body': 'A new question'})).status_code == 201
                result = await browser.post(f'/ai-suggestions/{stale.id}/feedback', headers=headers, json={'feedback_type': 'ACCEPTED'})
                assert result.status_code == 409, result.text
                assert 'stale' in result.json()['detail']
                assert (await browser.get(f'/ai-suggestions/{stale.id}', headers=headers)).json()['status'] == 'STALE'
                for status in [AISuggestionStatus.FAILED, AISuggestionStatus.STALE]:
                    row = await request_suggestion()
                    row.status = status
                    await db.commit()
                    assert (await browser.get(f'/ai-suggestions/{row.id}', headers=headers)).json()['status'] == status.value
                for status in [TicketStatus.RESOLVED, TicketStatus.CLOSED]:
                    ticket.status = status
                    await db.commit()
                    assert (await browser.post(path, headers=headers)).status_code == 409
                assert (await browser.get(f'/ai-suggestions/{uuid.uuid4()}', headers=headers)).status_code == 404
                print('PASS: AI request202/outbox/version, PENDING/PROCESSING/COMPLETED/FAILED/STALE, source [2], permissions, ACCEPTED/EDITED exactly one citation-free reply, REJECTED no reply, validation, duplicate409, stale409, resolved/closed409, missing404')
        finally:
            app.dependency_overrides.pop(get_db, None)
            await db.close()
            await outer.rollback()
            print('All Phase 2 fixture writes rolled back.')
    await engine.dispose()


asyncio.run(main())
