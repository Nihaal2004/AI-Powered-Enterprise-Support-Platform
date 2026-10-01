# Enterprise Support Platform — V1 Architecture

## 1. Architecture Goals

The V1 architecture should prioritize:

- correctness
- security
- maintainability
- clear service boundaries
- reliable asynchronous processing
- transactional consistency
- testability
- observability
- realistic production patterns without unnecessary microservice complexity

The system should remain simple enough to understand and build incrementally while still demonstrating strong backend, distributed-systems, DevOps, and AI-engineering practices.

The primary application backend will use a **modular monolith** architecture.

AI processing and document ingestion will run in separate background worker processes because they have different execution characteristics from normal API requests.

---

# 2. High-Level Architecture

```text
                       ┌─────────────────────┐
                       │ React + TypeScript  │
                       │      Frontend       │
                       └──────────┬──────────┘
                                  │
                                HTTPS
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │       FastAPI       │
                       │   Modular Monolith  │
                       └──────────┬──────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
       ┌─────────────┐      ┌───────────┐      ┌─────────────┐
       │ PostgreSQL  │      │   Redis   │      │  RabbitMQ   │
       │ + pgvector  │      │   Cache   │      │             │
       └─────────────┘      └───────────┘      └──────┬──────┘
                                                      │
                              ┌───────────────────────┴────────────────────┐
                              │                                            │
                              ▼                                            ▼
                   ┌─────────────────────┐                     ┌────────────────────┐
                   │  Ingestion Worker   │                     │     AI Worker      │
                   └──────────┬──────────┘                     └─────────┬──────────┘
                              │                                          │
                              ▼                                          ▼
                         ┌─────────┐                              ┌──────────────┐
                         │   S3    │                              │ Embedding /  │
                         │ Storage │                              │   LLM APIs   │
                         └─────────┘                              └──────────────┘


Browser ───────────── presigned upload URL ───────────────────────────→ S3


FastAPI / Workers ─────────→ Prometheus ─────────→ Grafana
```

---

# 3. Architectural Style

The backend shall be implemented as a **modular monolith**.

Modules may include:

```text
auth
users
tickets
messages
attachments
admin
knowledge
ai
notifications
analytics
```

These modules remain inside one FastAPI application rather than being deployed as independent HTTP microservices.

A likely backend structure is:

```text
backend/
├── api/
│   ├── routes/
│   └── dependencies/
├── services/
├── repositories/
├── models/
├── schemas/
├── db/
├── auth/
├── integrations/
├── workers/
├── core/
└── tests/
```

Typical request flow:

```text
API Route
   ↓
Service Layer
   ↓
Repository Layer
   ↓
PostgreSQL
```

Responsibilities:

```text
Route
→ HTTP concerns

Service
→ business rules

Repository
→ database access

Model
→ persisted entities

Schema
→ request / response validation
```

Modularity does not require turning every logical module into a separate network service.

---

# 4. Why Spring Boot Is Not Used

The V1 application will use FastAPI as the primary backend.

Spring Boot is intentionally excluded because introducing both frameworks would duplicate responsibilities and create unnecessary complexity.

Using both would add:

- another runtime
- service-to-service communication
- duplicated authentication logic
- duplicated validation
- additional deployment units
- additional failure points

Spring Boot can be learned separately through a smaller dedicated backend project.

---

# 5. Trust Boundaries

The React frontend is an untrusted client.

It must never be trusted to enforce authorization or business rules.

The browser may directly communicate only with:

```text
FastAPI
```

and:

```text
S3 through short-lived presigned URLs
```

The browser must never directly communicate with:

```text
PostgreSQL
Redis
RabbitMQ
worker services
```

The effective trust model is:

```text
Browser
   ↓
FastAPI
   ↓
trusted backend infrastructure
```

FastAPI remains the authority for:

- authentication
- authorization
- business rules
- S3 upload permissions
- ticket ownership
- state transitions
- AI job creation

---

# 6. Component Responsibilities

## 6.1 React + TypeScript

Responsibilities:

- user interface
- forms
- displaying ticket conversations
- agent dashboard
- admin interface
- client-side validation for usability
- maintaining temporary authentication state
- polling asynchronous AI job status
- direct S3 upload using presigned URLs

The frontend shall not be the only place where any security-sensitive rule is enforced.

---

## 6.2 FastAPI

Responsibilities:

- REST API
- JWT validation
- refresh-session handling
- RBAC
- resource-level authorization
- request validation
- ticket business logic
- transactions
- pagination
- filtering
- exception handling
- S3 presigned URL creation
- asynchronous job creation
- outbox-event creation
- cache invalidation
- API documentation
- metrics

---

## 6.3 PostgreSQL

PostgreSQL is the durable source of truth.

It stores:

- users
- refresh sessions
- tickets
- messages
- message revisions
- internal notes
- ticket assignments
- priority changes
- attachment metadata
- knowledge metadata
- AI jobs
- AI suggestions
- citations
- feedback
- audit information
- outbox events

---

## 6.4 pgvector

pgvector stores embeddings used for semantic retrieval.

It shall support retrieval from:

```text
official knowledge-base documents
approved sanitized resolved tickets
```

---

## 6.5 Redis

Redis is an auxiliary ephemeral system.

Primary uses:

- caching
- rate limiting
- temporary counters
- shared ephemeral state

Redis must not contain the only copy of important business state.

A Redis failure should not destroy:

- tickets
- assignments
- audit history
- AI feedback
- user identity
- ticket conversation history

---

## 6.6 RabbitMQ

RabbitMQ transports asynchronous jobs and events.

Major queues:

```text
ingestion.queue
ai.queue
notification.queue
```

RabbitMQ should carry lightweight messages containing identifiers rather than large application payloads.

Example AI job message:

```text
event_id
ticket_id
suggestion_id
requested_by_user_id
```

The worker then loads authoritative state from PostgreSQL.

---

## 6.7 Ingestion Worker

Responsibilities:

- read uploaded knowledge documents
- text extraction
- sanitization where required
- chunking
- embedding generation
- storing chunks
- pgvector indexing
- retries
- failure handling

---

## 6.8 AI Worker

Responsibilities:

- load latest ticket context
- construct retrieval query
- query vector indexes
- retrieve from multiple source classes
- rerank candidates
- perform evidence sufficiency checks
- call LLM
- validate citations
- store generated suggestion
- detect stale suggestions
- retry once if conversation state changes

---

## 6.9 S3

S3 stores binary objects:

```text
ticket attachments
knowledge documents
```

PostgreSQL stores object metadata and relationships.

---

## 6.10 Prometheus

Collects metrics from:

```text
FastAPI
AI worker
ingestion worker
```

---

## 6.11 Grafana

Displays dashboards for:

- API latency
- errors
- AI latency
- retrieval latency
- worker success/failure
- queue behavior
- cache performance
- ingestion performance

---

# 7. Authentication Architecture

The application uses a hybrid authentication model:

```text
short-lived stateless access JWT
+
server-tracked refresh session
```

---

## 7.1 Access Token

The access token is:

```text
JWT
15-minute lifetime
stateless
```

It is used on normal API requests.

Example:

```http
Authorization: Bearer <access-token>
```

Typical claims:

```text
sub
role
iat
exp
iss
aud
```

Sensitive information shall not be stored in the JWT payload.

The frontend should keep the access token in memory rather than long-term persistent browser storage.

---

## 7.2 Why Access JWTs Are Stateless

Access tokens are checked on nearly every API request.

Keeping them stateless avoids requiring a database session lookup on every request.

Each FastAPI instance can independently verify:

```text
signature
issuer
audience
expiration
```

This allows multiple API instances to validate the same token.

---

# 8. Refresh Session Architecture

Refresh credentials are long-lived relative to access JWTs and therefore require stronger control.

The system shall maintain server-side refresh sessions in PostgreSQL.

Suggested session properties:

```text
user_id
token_hash
family_id
created_at
expires_at
last_refreshed_at
used_at
revoked_at
replaced_by_token_id
user_agent
optional IP metadata
```

The raw refresh token must not be stored in PostgreSQL.

Instead:

```text
browser holds raw refresh token

PostgreSQL stores hash(refresh_token)
```

The refresh token should be stored in a cookie configured approximately as:

```text
HttpOnly
Secure
SameSite
```

---

# 9. Session Lifetime

Authentication policy for V1:

```text
Access JWT lifetime:
15 minutes

Refresh session absolute lifetime:
8 hours

Idle timeout:
60 minutes
```

Successful refreshes shall not extend the absolute session beyond the original eight-hour boundary.

Example:

```text
Login: 09:00
Absolute expiry: 17:00

Token refreshed at 16:45
→ session still expires at 17:00
```

This prevents indefinitely rotating sessions.

---

# 10. Refresh Token Rotation

Refresh tokens are single-use.

Flow:

```text
R1
 ↓ refresh
R2
 ↓ refresh
R3
```

When a refresh token is successfully used:

```text
old token → consumed
new token → issued
```

Each token family originates from a login session.

---

## 10.1 Reuse Detection

Suppose both a legitimate user and attacker possess `R1`.

Legitimate user:

```text
R1
↓
R2 issued
```

Attacker later sends `R1`.

The backend sees that `R1` has already been consumed.

This is treated as possible credential theft.

Response:

```text
detect reuse
↓
find token family
↓
revoke entire family
↓
force fresh authentication
```

The system cannot prevent the first malicious use if the attacker uses the stolen token before the legitimate user.

Rotation instead provides a mechanism for detecting copied credentials once reuse occurs.

---

## 10.2 Atomic Refresh Consumption

Concurrent refresh requests using the same token must not both succeed.

Conceptually:

```sql
UPDATE refresh_sessions
SET used_at = NOW()
WHERE id = :session_id
  AND used_at IS NULL
  AND revoked_at IS NULL
  AND expires_at > NOW();
```

Result:

```text
1 affected row
→ refresh request owns the token

0 affected rows
→ token expired, revoked, or already used
```

---

# 11. Logout

Explicit logout shall revoke the active refresh session.

The existing short-lived access JWT may remain valid until expiration, but its maximum remaining lifetime is limited.

Logout-all-devices shall revoke all active refresh sessions for the user.

Do not rely on browser-tab closure as a security boundary.

---

# 12. Token Refresh Strategy

The frontend should proactively refresh an access token shortly before expiration.

If proactive refresh fails or timing drifts, receiving a `401 Unauthorized` acts as a fallback trigger.

---

# 13. Ticket Creation Flow

Basic ticket creation:

```text
React
  ↓
POST /tickets
  ↓
FastAPI
  ↓
authenticate
  ↓
authorize CUSTOMER
  ↓
validate:
- title
- category
- urgency
- tags
- initial message
  ↓
BEGIN TRANSACTION
  ↓
create ticket
  ↓
create initial ticket_message
  ↓
COMMIT
  ↓
return created ticket
```

The initial ticket description is stored as the first customer-visible message.

---

# 14. Attachment Upload Flow

Attachments are independent from core ticket creation.

A failed optional attachment shall not roll back a valid ticket.

Flow:

```text
Browser
   ↓
request attachment upload
   ↓
FastAPI validates:
- user permissions
- filename
- expected size
- content type
   ↓
create metadata row:
PENDING
   ↓
generate backend-controlled S3 object key
   ↓
return presigned URL
   ↓
Browser uploads directly to S3
   ↓
Browser calls completion endpoint
   ↓
FastAPI verifies S3 object
   ↓
metadata becomes UPLOADED
```

---

## 14.1 Partial Attachment Failure

Each attachment is independent.

Example:

```text
file A → UPLOADED
file B → UPLOADED
file C → FAILED
```

The successful files remain attached.

The UI informs the user that one upload failed and allows retrying only that file.

---

## 14.2 Attachment States

Possible states:

```text
PENDING
UPLOADED
FAILED
EXPIRED
```

---

## 14.3 Stale Upload Cleanup

A scheduled background process periodically checks old `PENDING` upload records.

Example behavior:

```text
old PENDING attachment
       ↓
check S3
   /          \
exists      missing
  ↓            ↓
reconcile     EXPIRED
```

Stale upload cleanup shall not execute in the request path.

---

# 15. Ticket Claim Flow

Claim endpoint:

```text
POST /tickets/{ticket_id}/claim
```

Flow:

```text
React
 ↓
FastAPI
 ↓
authenticate JWT
 ↓
authorize AGENT
 ↓
BEGIN TRANSACTION
```

Atomic claim:

```sql
UPDATE tickets
SET assigned_agent_id = :agent_id,
    updated_at = NOW()
WHERE id = :ticket_id
  AND assigned_agent_id IS NULL;
```

Then inspect affected row count.

```text
1 row updated
→ claim successful

0 rows updated
→ ticket already claimed
→ return 409 Conflict
```

If successful:

```text
insert assignment-history row
insert outbox event
COMMIT
```

Then:

```text
invalidate Redis cache
return success
```

---

# 16. Poor Ticket-Claim Design

Avoid:

```text
SELECT assigned_agent_id
↓
application checks NULL
↓
UPDATE assigned_agent_id
```

Two concurrent requests can both observe:

```text
assigned_agent_id = NULL
```

and both decide to claim the ticket.

This is a check-then-act race condition.

The business condition should instead be expressed inside the database mutation:

```sql
UPDATE ...
WHERE assigned_agent_id IS NULL
```

---

# 17. Business Transaction Boundary

Ticket assignment, assignment history, and creation of the outbox event represent one logical business operation.

They should commit together:

```text
BEGIN

ticket ownership update
assignment audit record
outbox event

COMMIT
```

If any critical database operation fails:

```text
ROLLBACK
```

---

# 18. Transactional Outbox

PostgreSQL and RabbitMQ do not share a normal atomic transaction.

Therefore this is unsafe:

```text
commit PostgreSQL
↓
publish RabbitMQ
```

because the publish can fail after the commit.

The outbox pattern solves this:

```text
BEGIN
  modify ticket
  write audit event
  write outbox event
COMMIT
```

Then:

```text
Outbox Publisher
      ↓
RabbitMQ
      ↓
consumer
```

If RabbitMQ is temporarily unavailable, the outbox event remains pending and can be retried.

---

# 19. At-Least-Once Delivery and Idempotency

Asynchronous delivery should assume duplicates can occur.

Example failure:

```text
worker publishes event successfully
↓
worker crashes before marking event published
↓
event published again
```

Consumers must therefore tolerate duplicate delivery.

Workers should use stable event identifiers and idempotency checks where required.

---

# 20. Notification Flow

Notifications are external side effects.

Ticket assignment should not wait for email delivery.

Flow:

```text
ticket assignment transaction commits
       ↓
API returns success
       ↓
outbox publisher
       ↓
RabbitMQ
       ↓
notification worker
       ↓
email
```

If notification delivery fails:

```text
ticket remains assigned
notification can retry
failure is recorded
```

---

# 21. Conversation Model

`ticket_messages` represent the actual customer-agent communication thread.

Examples:

```text
Customer:
My account is locked.

Agent:
Please retry after resetting your MFA session.

Customer:
The issue still occurs.
```

These messages:

- are customer-visible
- are part of the official support conversation
- may be used as AI context
- differ from internal agent notes

---

# 22. Message Editing and Deletion

Any customer-visible message may be edited or soft-deleted within:

```text
15 minutes
```

of its own creation.

After 15 minutes, it becomes immutable.

An edit shall:

- preserve revision history
- update edit metadata
- increment conversation version

Soft deletion shall:

- preserve the row
- preserve history
- hide normal body display
- increment conversation version

The UI may show:

```text
This message was deleted.
```

---

# 23. Message Revision History

Edits should preserve historical content.

A possible revision entity:

```text
message_revisions
- id
- message_id
- previous_body
- edited_by_user_id
- edited_at
```

This prevents silent rewriting of support history.

---

# 24. Conversation Versioning

Each ticket stores:

```text
conversation_version
conversation_updated_at
```

`conversation_version` is incremented atomically whenever the customer-visible conversation changes.

This includes:

```text
new message
message edit
message soft-delete
```

Example:

```text
12 → 13 → 14
```

Version numbers are used for correctness and concurrency logic.

Timestamps are primarily for audit and display.

Internal notes, assignment changes, and priority changes do not increment the conversation version unless they later become part of the AI input context.

---

# 25. AI Suggestion Request Flow

Agent request:

```text
POST /tickets/{ticket_id}/ai-suggestions
```

Flow:

```text
FastAPI
 ↓
authenticate
 ↓
authorize agent access
 ↓
create ai_suggestion row
status = PENDING
 ↓
create outbox event
 ↓
COMMIT
 ↓
return 202 Accepted
```

The API response contains a suggestion identifier.

---

# 26. AI Worker Flow

```text
RabbitMQ ai.queue
       ↓
AI Worker
       ↓
load latest ticket
       ↓
load current conversation
       ↓
record conversation version
       ↓
construct retrieval query
       ↓
retrieve sources
       ↓
rerank
       ↓
evaluate evidence sufficiency
       ↓
generate suggestion
       ↓
validate citations
       ↓
compare conversation version
       ↓
store result
```

RabbitMQ should carry only identifiers and minimal metadata.

The full conversation shall not be serialized into the queue message.

---

# 27. AI Conversation Freshness

Tickets shall not be locked while AI generation runs.

External LLM calls may take several seconds and should not block:

- customer messages
- agent actions
- ticket updates

Instead, the AI worker captures:

```text
source_conversation_version
```

when processing begins.

When generation completes:

```text
current conversation version
vs
source conversation version
```

If equal:

```text
COMPLETED
```

If different:

```text
STALE
```

---

# 28. AI Retry Policy

If the conversation changes during generation:

```text
first stale result
→ automatically regenerate once
```

If the conversation changes again during the automatic retry:

```text
mark STALE
stop automatic retries
require manual regeneration
```

This avoids infinite regeneration loops on active tickets.

---

# 29. Why Tickets Are Not Locked During AI Generation

Holding a logical lock during an external LLM call would:

- block customers
- block agents
- create poor UX
- couple core ticket operations to AI latency
- require unnecessary distributed-locking logic

Version-based stale detection is preferred.

Interview explanation:

> The application does not lock tickets while the LLM is generating. Instead, it versions the conversation context. If the context changes, the generated suggestion becomes stale and is regenerated once.

---

# 30. RAG Knowledge Sources

RAG uses two source classes:

```text
1. Official knowledge-base documents
2. Approved and sanitized resolved tickets
```

They are retrieved separately because they have different authority and quality characteristics.

---

# 31. Retrieval Architecture

Query flow:

```text
ticket context
      ↓
deterministic query construction
      ↓
query embedding
      ↓
┌──────────────────────────────┐
│                              │
▼                              ▼
official-doc retrieval     resolved-ticket retrieval
│                              │
└──────────────┬───────────────┘
               ↓
       combine candidates
               ↓
            rerank
               ↓
       evidence evaluation
               ↓
        final context set
```

Initial candidate counts may be approximately:

```text
top 8 official chunks
top 8 resolved-ticket chunks
```

followed by reranking and selection of a smaller context set.

These values are tuning parameters rather than permanent rules.

---

# 32. Source Authority

Official documentation is generally more authoritative than historical ticket precedent.

If an official document and an approved resolved ticket conflict:

```text
official documentation should take precedence
```

The system should surface the conflict rather than blindly combining contradictory instructions.

---

# 33. Retrieval Query Construction

V1 shall use deterministic query construction.

Possible inputs:

```text
ticket title
primary category
tags
latest customer message
selected recent context
```

Example:

```text
Customer cannot access enterprise account after MFA reset.
Password change succeeds but lockout remains.
Need documented account recovery procedure.
```

The exact retrieval query text should be stored with the AI suggestion for debugging and evaluation.

---

# 34. Why Query Construction Starts Deterministic

Deterministic construction is preferred initially because it is:

- easier to debug
- cheaper
- lower latency
- reproducible
- easier to evaluate

LLM query rewriting may be added later only if retrieval evaluation demonstrates a measurable need.

---

# 35. Evidence Sufficiency

The system shall not generate a confident answer merely because vector search returned nearest neighbors.

Retrieval always returns something, even if the matches are weak.

Evidence assessment should consider multiple signals:

```text
reranking quality
number of supporting chunks
source authority
cross-source agreement
coverage of the user's issue
citation coverage
```

---

# 36. Evidence Levels

The AI pipeline uses:

```text
STRONG
PARTIAL
INSUFFICIENT
```

## STRONG

Enough relevant evidence exists to generate a grounded response.

## PARTIAL

Some parts are supported, but important details remain uncertain.

The response should explicitly distinguish:

```text
what is supported
what remains uncertain
```

## INSUFFICIENT

The available knowledge does not reliably answer the issue.

The system should abstain from producing a substantive answer.

---

# 37. Partial Evidence Behaviour

Example:

```text
The available documentation supports the standard MFA reset procedure.

However, the current knowledge base does not document the specific lockout state in this ticket.

Suggested response:
Try the standard MFA reset procedure first. If the issue persists, escalate to Identity Support.
```

This is preferable to fabricating unsupported instructions.

---

# 38. Citation Strategy

Citations are generated at chunk level.

Example:

```text
Reset MFA through the admin console [1].
Persistent account lockouts should be escalated to Identity Support [2].
```

Mappings:

```text
[1] → knowledge_chunk_id 812
[2] → knowledge_chunk_id 1442
```

---

# 39. Citation Generation

The LLM receives retrieved chunks with stable labels:

```text
SOURCE_1
SOURCE_2
SOURCE_3
```

It is instructed to generate inline citations such as:

```text
[1]
[2]
```

after factual claims.

---

# 40. Citation Validation

The AI worker shall validate generated citations before storing the suggestion.

Validation includes:

```text
every cited source existed in supplied context
citation identifier is valid
citation maps to a real knowledge chunk
```

If the model cites a nonexistent source:

```text
supplied sources: [1], [2], [3]

model outputs: [7]
```

the output is invalid and should be regenerated or failed.

---

# 41. Citation Storage

Only chunks actually cited in the final suggestion need to be recorded as final suggestion citations.

Example:

```text
16 retrieved candidates
↓
6 reranked context chunks
↓
3 actually cited
↓
store those 3 citation mappings
```

---

# 42. Grounding Status

Generated suggestions may have:

```text
FULLY_GROUNDED
PARTIALLY_GROUNDED
UNGROUNDED
```

If factual claims lack citation support, the suggestion may remain visible but should be flagged for stronger agent review.

A useful metric later is:

```text
citation coverage =
supported factual claims / total factual claims
```

---

# 43. Knowledge Chunk Model

A conceptual knowledge chunk contains:

```text
id
source_type
source_id
source_version
chunk_index
content
embedding
metadata
created_at
```

Possible source types:

```text
KB_DOCUMENT
RESOLVED_TICKET
```

---

# 44. Knowledge Source Versioning

Resolved-ticket knowledge and knowledge documents should retain source-version information.

Only current approved and successfully indexed source versions should participate in retrieval.

Old versions remain available for audit but are excluded from active retrieval.

---

# 45. Redis Caching Strategy

Use **cache-aside**.

Read flow:

```text
request
  ↓
Redis lookup
 /        \
hit       miss
 |          |
return   PostgreSQL
             ↓
          populate cache
             ↓
            return
```

Write flow:

```text
update PostgreSQL
       ↓
COMMIT
       ↓
invalidate Redis key
```

The database is always the source of truth.

---

# 46. Cache Invalidation

Cache invalidation happens only after successful database commit.

Do not:

```text
update Redis first
then attempt PostgreSQL update
```

because a failed database update could leave Redis representing state that never committed.

---

# 47. Shared Redis vs Process-Local Cache

Shared Redis is preferred over maintaining important caches inside each FastAPI process.

With multiple API instances:

```text
FastAPI 1 ─┐
FastAPI 2 ─┼→ Redis
FastAPI 3 ─┘
```

all instances observe the same cache.

Process-local caches could otherwise contain different stale versions of the same ticket.

---

# 48. Asynchronous Workloads

Major asynchronous workloads:

```text
knowledge ingestion
AI suggestion generation
notifications
stale upload cleanup
```

These should not block normal request-response paths.

---

# 49. Worker Separation

Use separate worker pools for ingestion and AI.

Reason:

```text
Ingestion:
batch-oriented
document processing
embedding-heavy

AI:
latency-sensitive
ticket-facing
LLM-dependent
```

A large ingestion backlog should not delay agent-facing AI generation.

---

# 50. Failure Handling

Background workers should support:

- retries
- retry limits
- dead-letter handling
- failure status persistence
- observability

Permanent failures must not disappear silently.

---

# 51. API Response Semantics

Typical claim endpoint responses:

```text
200 / 201
→ operation succeeded

401
→ authentication missing or invalid

403
→ authenticated but not authorized

404
→ resource does not exist or is intentionally hidden

409
→ valid request conflicts with current state
```

A duplicate ticket claim should normally return:

```text
409 Conflict
```

---

# 52. Observability

Metrics should include:

## API

```text
request count
latency
P50
P95
P99
error rate
status-code distribution
```

## AI

```text
suggestion latency
retrieval latency
LLM latency
evidence-level distribution
stale suggestion count
automatic retry count
citation coverage
```

## Workers

```text
jobs processed
jobs failed
retries
processing duration
dead-letter count
```

## Redis

```text
cache hits
cache misses
cache hit rate
```

## Attachments

```text
upload success rate
upload failure rate
expired pending uploads
```

## AI feedback

```text
acceptance rate
edit rate
rejection rate
```

---

# 53. Logging

Application logs should include contextual identifiers where appropriate:

```text
request_id
user_id
ticket_id
job_id
event_id
suggestion_id
```

Secrets and sensitive user data must not be written into logs unnecessarily.

---

# 54. API Documentation

FastAPI shall expose API documentation generated from the application's OpenAPI schema.

Endpoints should clearly document:

- request schema
- response schema
- authentication requirements
- relevant error states

---

# 55. Deployment Units

V1 deployment units:

```text
frontend
FastAPI backend
PostgreSQL
Redis
RabbitMQ
ingestion worker
AI worker
notification worker
Prometheus
Grafana
```

S3 and external AI APIs remain managed external services.

---

# 56. Containerization

Local development shall use Docker containers.

A likely Docker Compose environment:

```text
frontend
backend
postgres
redis
rabbitmq
ingestion-worker
ai-worker
notification-worker
prometheus
grafana
```

This allows local reproduction of the major production-style architecture.

---

# 57. Deployment Principle

Do not create separate network services unless there is a meaningful reason such as:

```text
independent scaling
different failure domain
different runtime characteristics
separate ownership
security boundary
```

Logical separation alone is not sufficient justification for a microservice.

---

# 58. Core Architectural Principles

The V1 architecture follows these principles:

```text
PostgreSQL is the source of truth.

Redis accelerates but does not own durable state.

RabbitMQ carries asynchronous work.

Workers load authoritative data rather than trusting large queued snapshots.

External side effects do not participate directly in core DB transactions.

Business rules are enforced server-side.

Critical database state changes are transactional.

Concurrent operations use database-level correctness guarantees.

AI never blocks normal ticket communication.

AI outputs are versioned against conversation state.

Weak evidence results in uncertainty or abstention.

Official documentation takes precedence over historical precedent.

Customer-sensitive information is not reused blindly in RAG.

Observability is built around measured behavior rather than arbitrary claims.

Modularity does not imply microservices.
```