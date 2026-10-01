# Enterprise Support Platform — V1 Requirements

## 1. Problem

Build a production-style customer support platform where customers can raise tickets, support agents can manage and resolve them, and admins can manage users, knowledge sources, and platform operations.

The system will include an AI knowledge assistant that helps support agents by retrieving relevant company documentation and approved historical support knowledge, then generating grounded response suggestions with citations.

The AI must assist support agents rather than automatically responding to customers.

The system should demonstrate practical software-engineering decisions around security, maintainability, reliability, scalability, testing, observability, asynchronous processing, databases, distributed systems, DevOps, AWS, and AI engineering.

---

## 2. Actors

### 2.1 Customer

A customer can:

- Register and log in.
- Create support tickets.
- Select a ticket category.
- Indicate whether the issue is `NORMAL` or `URGENT`.
- Add messages to their ticket conversation.
- Upload attachments.
- Track ticket status.
- View their own ticket history.
- View responses from support agents.

Customers do not control the authoritative internal support priority.

---

### 2.2 Support Agent

A support agent can:

- View all tickets.
- Modify tickets assigned to themselves.
- View tickets assigned to other agents in read-only mode.
- View unassigned tickets.
- Manually claim unassigned tickets.
- View all resolved and closed tickets.
- Add internal notes to visible tickets.
- Raise the priority of an unassigned ticket.
- Change the priority of tickets assigned to themselves.
- Reply to customers only after owning the ticket.
- Change ticket status for tickets assigned to themselves.
- Request AI-generated response suggestions.
- Accept, edit, or reject AI suggestions.
- Review resolved tickets for possible RAG reuse.
- Approve or reject resolved tickets for knowledge reuse.

---

### 2.3 Admin

An admin can:

- Manage users.
- Manage user roles.
- Assign or reassign tickets.
- Manage ticket categories and tags.
- Upload and manage knowledge-base documents.
- Review document-ingestion status.
- Approve or reject resolved tickets for RAG reuse.
- View basic platform analytics.
- Perform auditable administrative moderation where required.

---

# 3. Functional Requirements

## 3.1 Authentication and Users

**FR-01:** Users shall be able to register and authenticate securely.

**FR-02:** The system shall support the roles:

- `CUSTOMER`
- `AGENT`
- `ADMIN`

**FR-03:** Authorization shall be enforced server-side.

**FR-04:** Customers shall only be able to access tickets belonging to their own account.

**FR-05:** Support agents may view active tickets assigned to other agents but shall have read-only access to them.

**FR-06:** Admins may manage users and roles.

---

## 3.2 Ticket Creation

**FR-07:** Customers shall be able to create a support ticket.

**FR-08:** A new ticket shall include:

- title
- primary category
- customer urgency
- initial message
- optional tags
- optional attachments

**FR-09:** The initial ticket description shall be stored as the first ticket message rather than as a separate long-text field on the ticket.

---

## 3.3 Ticket Conversation

**FR-10:** Tickets shall support multiple customer-visible messages.

**FR-11:** Messages shall record:

- ticket
- author
- content
- timestamp

**FR-12:** Attachments shall be represented as separate records linked to ticket messages.

---

## 3.4 Ticket Assignment

**FR-13:** A support agent shall be able to view:

- tickets assigned to themselves
- unassigned tickets
- tickets assigned to other agents in read-only mode
- all resolved and closed tickets

**FR-14:** An unassigned ticket may be manually claimed by a support agent.

**FR-15:** An admin may assign or reassign any ticket.

**FR-16:** Support agents may not reassign tickets to another agent unless an elevated permission is added in the future.

**FR-17:** Ticket assignment changes shall record:

- previous owner
- new owner
- acting user
- timestamp
- optional reason

**FR-18:** Claiming an unassigned ticket shall be atomic.

If multiple agents attempt to claim the same ticket concurrently, exactly one claim shall succeed.

**FR-19:** The ticket's current owner shall be stored directly on the ticket for efficient lookup, while a separate assignment-history table shall preserve historical assignment events.

---

## 3.5 Ticket Priority

Customers shall indicate urgency separately from the system's authoritative internal priority.

Customer urgency:

- `NORMAL`
- `URGENT`

Internal priority:

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

**FR-20:** A customer may indicate whether a ticket is normal or urgent.

**FR-21:** Customer urgency shall not directly determine internal ticket priority.

**FR-22:** Internal priority shall be controlled by support agents or admins.

**FR-23:** Any support agent may increase the priority of an unassigned ticket.

**FR-24:** Only the assigned support agent or an admin may decrease ticket priority.

**FR-25:** Priority changes shall record:

- previous priority
- new priority
- acting user
- timestamp
- optional reason

---

## 3.6 Ticket Ownership and Replies

**FR-26:** An agent must claim an unassigned ticket before sending a customer-visible reply.

**FR-27:** Unassigned tickets shall remain read-only except for explicitly permitted operations such as:

- claiming the ticket
- adding internal notes
- increasing priority

**FR-28:** Agents shall not modify active tickets assigned to another agent.

---

## 3.7 Internal Notes

**FR-29:** Support agents may add internal notes to tickets they are permitted to view.

**FR-30:** Internal notes shall never be visible to customers.

**FR-31:** Internal notes shall be append-only.

**FR-32:** Support agents shall not silently edit or delete internal notes after creation.

**FR-33:** Internal notes shall record:

- ticket
- author
- content
- timestamp

**FR-34:** Administrative moderation of notes, if supported, shall be auditable.

---

# 4. Ticket Lifecycle

Ticket status shall use a controlled set of states:

```text
OPEN
IN_PROGRESS
WAITING_FOR_CUSTOMER
RESOLVED
CLOSED
```

Typical transitions:

```text
OPEN → IN_PROGRESS
OPEN → CLOSED

IN_PROGRESS → WAITING_FOR_CUSTOMER
IN_PROGRESS → RESOLVED

WAITING_FOR_CUSTOMER → IN_PROGRESS

RESOLVED → IN_PROGRESS
RESOLVED → CLOSED
```

Business rules for valid status transitions must be enforced by the backend, not only by the frontend.

---

# 5. Categories and Tags

Ticket categories shall be admin-managed rather than hard-coded application enums.

A ticket shall use:

- one primary category
- zero or more tags

This separates routing/reporting from flexible classification.

Categories should support:

- name
- description
- active/inactive state

Historical categories should be deactivated rather than hard-deleted when tickets reference them.

Tags may be associated with multiple tickets.

---

# 6. AI Assistant Behaviour

The AI assistant is agent-facing only.

The AI shall not automatically send responses to customers.

The expected flow is:

```text
Ticket + conversation
        ↓
Query construction
        ↓
Vector / metadata retrieval
        ↓
Optional reranking
        ↓
Relevant knowledge
        ↓
LLM
        ↓
Suggested response
        ↓
Citations
        ↓
Agent accepts / edits / rejects
```

---

## 6.1 AI Suggestion Lifecycle

AI suggestion generation shall be asynchronous.

A request should create a suggestion job and return immediately.

Possible job states:

```text
PENDING
PROCESSING
COMPLETED
FAILED
```

The generated suggestion shall be stored separately from the actual ticket conversation.

Customer-visible content is only created when the agent explicitly sends a message.

---

## 6.2 AI Feedback

Agents shall be able to:

- accept
- edit
- reject

an AI suggestion.

Feedback shall store:

- suggestion
- acting agent
- action
- timestamp

If the suggestion was edited, the edited text shall also be stored.

Rules:

```text
ACCEPTED → edited_text = NULL
EDITED   → edited_text = final edited version
REJECTED → edited_text = NULL
```

The actual response sent to the customer belongs in `ticket_messages`.

---

## 6.3 Citations

Each AI suggestion should preserve the supporting evidence used to generate it.

Citation metadata should include, where applicable:

- source type
- source identifier
- chunk identifier
- retrieval score
- reranking score
- rank

The interface should distinguish between citations from:

- official knowledge-base documents
- approved resolved tickets

---

## 6.4 Insufficient Knowledge

The system must not confidently generate unsupported answers when retrieval quality is poor.

Conceptually:

```text
retrieval
    ↓
sufficient evidence?
   / \
 yes  no
 |     |
LLM   abstain
```

The system should support an explicit insufficient-evidence outcome rather than forcing an answer.

Exact thresholds should be determined through measurement rather than arbitrary assumptions.

---

# 7. Knowledge-Base Documents

Admins may upload company documentation.

The ingestion process shall be asynchronous:

```text
upload document
      ↓
store in S3
      ↓
create ingestion job
      ↓
RabbitMQ
      ↓
ingestion worker
      ↓
extract text
      ↓
chunk
      ↓
embed
      ↓
index in pgvector
```

Knowledge document states may include:

```text
PENDING
UPLOADED
PROCESSING
READY
FAILED
```

---

# 8. Resolved Tickets as RAG Knowledge

Resolved tickets shall not automatically become trusted AI knowledge.

The lifecycle shall be:

```text
RESOLVED
   ↓
candidate for review
   ↓
approved / rejected
   ↓
sanitize
   ↓
chunk + embed
   ↓
index
   ↓
READY
```

**FR-35:** Resolved tickets shall not participate in RAG retrieval until explicitly reviewed.

**FR-36:** Support agents and admins may approve or reject resolved tickets for RAG reuse.

**FR-37:** Approval actions shall record:

- reviewer
- timestamp
- decision
- optional reason

**FR-38:** Only approved resolved tickets may be used as historical RAG knowledge.

---

# 9. PII and Sensitive-Data Handling for RAG

Resolved tickets approved for RAG shall be sanitized before embedding.

The sanitization process should remove or mask customer-identifying or sensitive information such as:

- customer names
- email addresses
- phone numbers
- addresses
- account identifiers
- tokens
- credentials
- API keys
- other secrets

**FR-39:** Approved resolved tickets shall be sanitized before indexing.

**FR-40:** Raw customer data shall not be embedded into the reusable RAG knowledge index when it is not necessary.

**FR-41:** The original ticket shall remain unchanged for audit/history purposes.

The RAG system shall use a separate sanitized representation.

---

# 10. RAG Knowledge Versioning

If an approved resolved ticket changes after approval:

```text
READY
  ↓
source changes
  ↓
STALE
  ↓
approval invalidated
  ↓
sanitize again
  ↓
review again
  ↓
re-index
```

**FR-42:** Any modification to a resolved ticket after RAG approval shall invalidate that approval.

**FR-43:** Modified tickets must be sanitized and reviewed again before reuse.

**FR-44:** Only the latest approved and successfully indexed version may participate in retrieval.

---

# 11. File Storage

Application files shall not be stored directly as large blobs inside PostgreSQL.

Use:

```text
S3
- knowledge documents
- ticket attachments
```

PostgreSQL shall store metadata such as:

- storage key
- original filename
- MIME type
- size
- checksum
- uploader
- associated ticket/message/document
- timestamps
- upload state

---

## 11.1 Direct S3 Upload

Browsers shall upload large files directly to S3 using short-lived presigned URLs.

Expected flow:

```text
Browser
  ↓
request upload permission
  ↓
FastAPI validates request
  ↓
FastAPI creates PENDING metadata
  ↓
FastAPI returns presigned S3 URL
  ↓
Browser uploads directly to S3
  ↓
Browser reports completion
  ↓
FastAPI verifies object exists in S3
  ↓
metadata becomes UPLOADED
```

FastAPI should verify the object through S3 rather than blindly trusting the frontend.

Presigned URLs should be:

- short-lived
- limited to one object
- limited to the required method
- created only after validating expected metadata

The application must generate its own storage keys rather than trusting user-supplied filenames as S3 object keys.

---

# 12. Asynchronous Processing

Two major asynchronous workloads shall use separate worker types.

## 12.1 Ingestion Worker

Responsible for:

- document extraction
- chunking
- embedding
- vector indexing
- S3 interaction

## 12.2 AI Worker

Responsible for:

- constructing retrieval queries
- retrieving relevant chunks
- optional reranking
- LLM calls
- citation assembly
- storing AI suggestions

The queues should be logically separated, for example:

```text
RabbitMQ
├── ingestion.queue → Ingestion Worker
└── ai.queue        → AI Worker
```

The worker types may remain in the same repository/codebase.

---

# 13. Database and Service Architecture

The application shall use a modular monolith for the primary API.

FastAPI shall access PostgreSQL directly through application layers rather than through a separate database HTTP service.

Conceptual backend structure:

```text
Route
  ↓
Service layer
  ↓
Repository layer
  ↓
PostgreSQL
```

Example:

```text
POST /tickets/{id}/claim
        ↓
TicketService.claim_ticket()
        ↓
TicketRepository.atomic_claim()
        ↓
PostgreSQL
```

Modularity does not require turning every module into a network service.

---

# 14. PostgreSQL

PostgreSQL is the source of truth for durable application state.

Durable business data includes:

- users
- tickets
- messages
- internal notes
- assignments
- priority history
- AI suggestions
- AI feedback
- audit records
- knowledge metadata
- ingestion state

`pgvector` shall be used for vector search.

---

# 15. Redis

Redis is an auxiliary system and shall not be the primary store for important business state.

Appropriate Redis uses include:

- caching
- rate-limit counters
- temporary ephemeral state
- shared cache across multiple API instances

Important durable state must remain in PostgreSQL.

The system should remain recoverable if Redis data is lost.

---

## 15.1 Cache Strategy

Use a cache-aside pattern.

Read:

```text
request
  ↓
Redis?
 / \
hit miss
 |    |
return PostgreSQL
        ↓
      cache
        ↓
      return
```

Write:

```text
update PostgreSQL
      ↓
commit
      ↓
invalidate relevant Redis cache key
```

Cache invalidation shall occur after the database update succeeds.

---

# 16. Transactions and Concurrency

Critical business operations shall use database transactions.

Example: ticket claim.

The claim should use an atomic conditional update:

```sql
UPDATE tickets
SET assigned_agent_id = :agent_id
WHERE id = :ticket_id
  AND assigned_agent_id IS NULL;
```

Exactly one concurrent claimant should succeed.

If no row is updated, the API should return a conflict response such as:

```text
409 Conflict
```

Avoid unsafe check-then-act flows such as:

```text
SELECT owner
if NULL:
    UPDATE owner
```

when the decision can be expressed atomically in the database.

---

# 17. Business Transactions

Database changes that represent one logical business operation shall commit together.

Example ticket assignment:

```text
BEGIN
  update current ticket owner
  insert assignment-history row
  insert outbox event
COMMIT
```

If any critical database operation fails, the entire transaction should roll back.

---

# 18. Transactional Outbox

External side effects such as notifications shall not be treated as part of the core database transaction.

The application shall use an outbox pattern where appropriate.

Example:

```text
PostgreSQL transaction
├── ticket update
├── audit row
└── outbox row
        ↓
COMMIT
        ↓
Outbox publisher
        ↓
RabbitMQ
        ↓
Notification worker
        ↓
Email
```

This avoids failure gaps between committing business state and publishing an external message.

Outbox consumers should be designed to tolerate duplicate delivery.

---

# 19. Idempotency

Asynchronous message processing should assume at-least-once delivery.

Workers should therefore be idempotent where required.

For example, a notification worker should avoid sending the same logical notification twice if the same event is redelivered.

---

# 20. Notifications

Notifications are secondary side effects.

A successful ticket assignment API request should return after the core database transaction succeeds.

The request should not wait for email delivery to complete.

If email delivery fails:

- assignment remains valid
- the notification job may retry
- failure should be observable

---

# 21. Testing Requirements

Testing is a core project requirement.

The system shall include:

- backend unit tests
- API integration tests
- database/repository tests
- authentication tests
- authorization tests
- concurrency tests
- frontend component tests
- end-to-end Playwright tests
- RAG retrieval tests
- RAG evaluation tests

Important scenarios should include:

- only one concurrent ticket claim succeeds
- customers cannot access another customer's tickets
- agents cannot modify another agent's active ticket
- agents may view another agent's active ticket
- unassigned tickets cannot receive customer-visible replies before claim
- internal notes never appear in customer APIs
- priority authorization rules
- stale RAG approvals are invalidated after source changes
- only approved sanitized ticket knowledge is retrieved

---

# 22. CI/CD

GitHub Actions shall automatically execute relevant checks before deployment.

This should include:

- backend tests
- frontend tests
- linting
- formatting checks where appropriate
- build verification
- integration tests where feasible

Deployment should not proceed when required checks fail.

---

# 23. Observability

The platform shall expose useful operational metrics.

Metrics should include:

- API latency
- error rate
- request count
- AI response latency
- retrieval latency
- worker processing duration
- worker failures
- worker retries
- queue backlog where practical
- cache hit/miss behavior
- ingestion success/failure
- AI suggestion acceptance/edit/rejection rates

Prometheus shall collect metrics.

Grafana shall be used for dashboards.

---

# 24. Non-Functional Requirements

## Security

- Passwords shall be securely hashed.
- JWT expiration shall be enforced.
- RBAC shall be enforced server-side.
- Secrets shall not be committed to source control.
- Presigned URLs shall be short-lived.
- File metadata shall be validated.
- Customer-sensitive information shall not be exposed through RAG knowledge unnecessarily.
- Internal notes shall never be exposed through customer-facing endpoints.

## Maintainability

- Backend code shall be separated into clear API, service, repository, model, schema, and infrastructure responsibilities.
- Database migrations shall be used.
- Business rules shall live in backend services rather than solely in frontend code.

## Reliability

- Critical state changes shall use transactions.
- Concurrent ticket claiming shall be safe.
- Background jobs shall support retries.
- Permanent job failures shall be recorded.
- External side effects should not corrupt core business state.

## Scalability

- Large file uploads shall bypass the API through direct S3 upload.
- Slow AI and ingestion workloads shall run asynchronously.
- PostgreSQL shall use appropriate indexes.
- Large list endpoints shall use pagination.
- Redis may be used to reduce repeated reads.

## Observability

The platform shall measure actual behavior rather than make unsupported performance claims.

---

# 25. Initial Success Metrics

Initial engineering targets may include:

```text
Normal CRUD API P95 latency < 300 ms locally
```

All large ticket-list endpoints shall be paginated.

The project should measure:

- backend test coverage
- API latency
- cache hit rate
- retrieval quality
- AI latency
- worker success/failure rate
- retry behavior
- suggestion acceptance rate
- suggestion edit rate
- suggestion rejection rate

These targets are engineering goals and should only become resume claims after being measured.

---

# 26. V1 Architecture Boundary

Use:

```text
React + TypeScript
        ↓
FastAPI modular monolith
        ↓
PostgreSQL + pgvector
        ↓
Redis

FastAPI
   ↓
RabbitMQ
   ├── ingestion worker
   └── AI worker

Workers ↔ S3
Workers ↔ external AI APIs

Prometheus ← API / workers
Grafana ← Prometheus
```

The following should not be split into independent microservices for V1:

- authentication
- users
- tickets
- admin
- analytics
- RAG API orchestration

The backend should remain a modular monolith unless actual scaling or ownership requirements justify further separation.

---

# 27. Out of Scope for V1

Do not implement these unless the core platform is complete:

- live chat
- WebSockets
- email-to-ticket ingestion
- Slack integration
- voice support
- billing
- multi-tenant SaaS architecture
- Kubernetes
- fine-tuning
- complex multi-agent orchestration
- unnecessary microservices
- automatic AI responses directly to customers