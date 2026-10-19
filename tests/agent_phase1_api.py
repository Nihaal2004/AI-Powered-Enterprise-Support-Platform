"""Run inside the backend container; all fixtures and API writes are rolled back.
PowerShell: Get-Content -Raw tests/agent_phase1_api.py | docker exec -i enterprisesupportplatform-backend-1 python -
"""
import asyncio
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.db.session import engine, get_db
from app.core.security import hash_password, JWT_SECRET_KEY, JWT_ALGORITHM
from app.models.user import User, UserRole
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.ticket_category import TicketCategory


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
            agent = User(id=uuid.uuid4(), name='Phase 1 Agent', email=f'agent-{suffix}@example.com', password_hash=hash_password(password), role=UserRole.AGENT)
            customer = User(id=uuid.uuid4(), name='Phase 1 Customer', email=f'customer-{suffix}@example.com', password_hash=hash_password(password), role=UserRole.CUSTOMER)
            category = TicketCategory(id=uuid.uuid4(), name=f'Phase 1 {suffix}')
            db.add_all([agent, customer, category])
            await db.flush()
            db.add_all([Agent(user_id=agent.id), Customer(user_id=customer.id)])
            await db.commit()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url='http://test') as browser:
                async def login(user):
                    response = await browser.post('/auth/login', json={'email': user.email, 'password': password})
                    assert response.status_code == 200, response.text
                    assert 'HttpOnly' in response.headers['set-cookie']
                    assert 'Path=/auth' in response.headers['set-cookie']
                    return {'Authorization': 'Bearer ' + response.json()['access_token']}
                customer_headers = await login(customer)
                denied = await browser.get('/tickets?assigned_to_me=true', headers=customer_headers)
                assert denied.status_code == 403
                created = await browser.post('/tickets', headers=customer_headers, json={'primary_category_id': str(category.id), 'title': 'Phase 1 integration', 'initial_message': 'Please help with my account.'})
                assert created.status_code == 201, created.text
                ticket_id = created.json()['id']
                headers = await login(agent)
                assert (await browser.get('/auth/me', headers=headers)).json()['role'] == 'AGENT'
                queue = await browser.get('/tickets?unassigned=true', headers=headers)
                assert any(ticket['id'] == ticket_id for ticket in queue.json())
                assert (await browser.get(f'/tickets/{ticket_id}', headers=headers)).status_code == 200
                messages = await browser.get(f'/tickets/{ticket_id}/messages', headers=headers)
                assert messages.json()[0]['message_type'] == 'CUSTOMER_REPLY'
                assert (await browser.post(f'/tickets/{ticket_id}/messages', headers=headers, json={'body': 'Before claim'})).status_code == 403
                claim = await browser.post(f'/tickets/{ticket_id}/claim', headers=headers)
                assert claim.status_code == 200, claim.text
                assert claim.json()['assigned_agent_id'] == str(agent.id)
                assert (await browser.post(f'/tickets/{ticket_id}/claim', headers=headers)).status_code == 409
                assigned = await browser.get('/tickets?assigned_to_me=true', headers=headers)
                assert any(ticket['id'] == ticket_id for ticket in assigned.json())
                reply = await browser.post(f'/tickets/{ticket_id}/messages', headers=headers, json={'body': 'We are looking into this.'})
                assert reply.status_code == 201, reply.text
                assert reply.json()['message_type'] == 'AGENT_REPLY'
                messages = await browser.get(f'/tickets/{ticket_id}/messages', headers=headers)
                assert len(messages.json()) == 2
                assert (await browser.post(f'/tickets/{ticket_id}/messages', headers=headers, json={'body': ''})).status_code == 422
                expired = jwt.encode({'sub': str(agent.id), 'role': 'AGENT', 'exp': datetime.now(timezone.utc) - timedelta(minutes=1)}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
                assert (await browser.get('/auth/me', headers={'Authorization': 'Bearer ' + expired})).status_code == 401
                old_cookie = browser.cookies.get('refresh_token')
                refreshed = await browser.post('/auth/refresh')
                assert refreshed.status_code == 200, refreshed.text
                assert browser.cookies.get('refresh_token') != old_cookie
                assert (await browser.get('/auth/me', headers={'Authorization': 'Bearer ' + refreshed.json()['access_token']})).status_code == 200
                assert (await browser.post('/auth/logout')).status_code == 204
                assert (await browser.post('/auth/refresh')).status_code == 401
                print('PASS: login/me, customer denied, queues, details, conversation, claim/conflict, agent reply, validation, expired access, refresh rotation, logout')
        finally:
            app.dependency_overrides.pop(get_db, None)
            await db.close()
            await outer.rollback()
            print('Temporary fixtures and API writes rolled back.')
    await engine.dispose()


asyncio.run(main())
