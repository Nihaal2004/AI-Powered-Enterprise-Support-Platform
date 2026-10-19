You are working on my existing project:

D:\Projects\Enterprise Support Platform

Goal:
Turn the existing backend-heavy Enterprise Support Platform into a clean, interview/demo-ready full-stack application, with the frontend focused first on the Support Agent workflow.

IMPORTANT:
Do not redesign the backend architecture.
Do not invent API endpoints.
Do not rewrite working backend code unless an actual integration bug requires it.
Inspect the existing repository and API/OpenAPI contracts before making changes.

==================================================
PROJECT OVERVIEW
==================================================

This is an AI-powered enterprise customer support platform.

Main roles:
1. CUSTOMER
2. AGENT
3. ADMIN

Tech stack:

Frontend:
- React
- TypeScript
- Vite
- nginx in Docker

Backend:
- FastAPI
- Python
- SQLAlchemy 2 async
- asyncpg
- PostgreSQL 16 + pgvector
- Alembic

Infrastructure:
- Docker Compose
- RabbitMQ
- AWS S3
- IAM
- transactional outbox

AI / RAG:
- FastEmbed
- BAAI/bge-small-en-v1.5
- 384-dimensional embeddings
- PostgreSQL pgvector
- Gemini API
- PDF + TXT knowledge-base ingestion
- page-aware citations

==================================================
EXISTING BACKEND FEATURES
==================================================

Most backend functionality is already working and manually tested.

Authentication:
- register/login
- JWT access token
- access token expiry around 15 minutes
- refresh token in HttpOnly cookie
- refresh-token rotation
- refresh-session revocation
- logout
- current-user endpoint
- CUSTOMER / AGENT / ADMIN roles

Ticket system:
- customer creates tickets
- initial message creates conversation
- conversation history
- customer and agent replies
- message edit within 15 minutes
- soft delete
- message revision history
- internal notes
- priority management
- ticket status state machine
- agent ticket queues
- atomic claim
- assignment history
- priority history

Ticket statuses:
OPEN
IN_PROGRESS
WAITING_FOR_CUSTOMER
RESOLVED
CLOSED

Ticket priority:
LOW
MEDIUM
HIGH
CRITICAL

Attachments:
- AWS S3 presigned browser upload
- authenticated attachment metadata
- upload confirmation
- temporary authenticated download URLs

Async architecture:
- transactional outbox
- RabbitMQ
- outbox publisher
- KB ingestion worker
- AI suggestion worker

Knowledge base:
- admin uploads TXT or PDF
- direct S3 upload
- asynchronous indexing
- text extraction
- PDF page-aware extraction
- chunking
- FastEmbed embeddings
- pgvector storage
- semantic retrieval

Knowledge chunks include:
- document_id
- chunk_index
- page_number nullable
- content
- 384-d embedding

AI suggestion flow:
- assigned agent requests AI suggestion
- API returns 202 / PENDING
- outbox event created atomically
- RabbitMQ AI queue
- AI worker loads ticket conversation
- semantic KB retrieval
- similarity filtering
- Gemini grounded generation
- inline citation markers such as [1], [2]
- citation metadata contains:
  - chunk_id
  - document_id
  - chunk_index
  - page_number
  - similarity

AI suggestion statuses:
PENDING
PROCESSING
COMPLETED
FAILED
STALE

Stale protection:
- every suggestion captures ticket conversation_version
- if conversation changes before/during generation, suggestion becomes STALE
- stale suggestions must not be used

Grounding:
- AI must use KB evidence
- insufficient evidence can cause abstention
- citation numbers are validated
- only citations actually referenced by the model are stored

Human feedback:
ACCEPTED
EDITED
REJECTED

Behavior:
- ACCEPTED sends the AI draft as a normal AGENT_REPLY
- EDITED sends the agent's modified final text
- REJECTED sends no customer message
- feedback is stored
- conversation_version increments through the normal ticket reply flow
- operation is transactional

Important citation behavior:
- agent-facing AI suggestion contains [1], [2], etc.
- citation metadata remains available to agent
- customer-visible AGENT_REPLY has citation markers stripped
- customer should never see internal citation numbers

PDF support has been verified end-to-end:
- PDF page extraction
- page-aware chunking
- semantic retrieval
- page number preserved in AI citation metadata

==================================================
FIRST TASK: FRONTEND
==================================================

Focus FIRST on the AGENT experience.

Before coding:
1. Inspect the entire frontend directory.
2. Inspect backend routes/schemas relevant to authentication, tickets, messages, queues, AI suggestions and feedback.
3. Inspect FastAPI OpenAPI if useful.
4. Reuse existing API contracts exactly.
5. Tell me briefly what frontend structure currently exists and what you plan to modify.

Then implement.

==================================================
AGENT UI REQUIREMENTS
==================================================

Build a professional, clean support-dashboard UI.

Do not over-design it.
This should look like a credible enterprise support application, not a flashy AI demo.

Primary desktop layout:

LEFT:
Ticket queue / ticket list

CENTER:
Selected ticket conversation

RIGHT:
Ticket details + AI Assistant panel

Responsive behavior is useful, but desktop demo quality is the priority.

--------------------------------------------------
1. AUTH
--------------------------------------------------

Build/use an agent login screen.

Requirements:
- email
- password
- loading state
- error state
- login API integration

Access token:
- keep access token in application memory/state if consistent with existing design
- do not persist sensitive tokens unnecessarily to localStorage unless the current project already intentionally does that

Refresh:
- backend uses HttpOnly refresh cookie
- implement transparent access-token refresh when appropriate
- handle 401 cleanly
- if refresh fails, return user to login

Role:
- agent pages should require AGENT role

--------------------------------------------------
2. AGENT TICKET QUEUE
--------------------------------------------------

Provide queue tabs/filters:

- Unassigned
- Assigned to Me

Display useful fields where API supports them:
- title
- status
- priority
- customer urgency
- category
- last message/update time
- assigned/unassigned state

Selecting a ticket should load it into the conversation panel.

For unassigned tickets:
- allow agent to Claim
- handle claim conflict / 409 cleanly

--------------------------------------------------
3. TICKET CONVERSATION
--------------------------------------------------

Display customer and agent messages distinctly.

Show:
- author type
- timestamp
- edited state if available
- deleted-message placeholder

Allow assigned agent to:
- send reply
- edit own recent messages where backend permits
- delete own recent messages where backend permits

If edit/delete APIs already exist, integrate them.
Do not invent new endpoints.

Customer-visible messages and internal notes must remain visually separated.

--------------------------------------------------
4. INTERNAL NOTES
--------------------------------------------------

Agent should be able to:
- view internal notes
- create internal note

Clearly label them as INTERNAL.

Do not show internal notes as customer conversation messages.

--------------------------------------------------
5. TICKET CONTROLS
--------------------------------------------------

Provide controls for:
- claim
- status
- priority

Respect existing backend authorization and state transitions.

Handle:
- 403
- 409
- invalid transition messages

Do not duplicate backend business rules in complicated frontend logic.
Frontend can guide the user, but backend remains authoritative.

--------------------------------------------------
6. AI ASSISTANT PANEL
--------------------------------------------------

This is the most important demo feature.

Button:
Generate AI Suggestion

Calling the endpoint should:
- create suggestion
- receive 202 / PENDING
- poll suggestion status until terminal state

States to display:

PENDING:
"Queued"

PROCESSING:
"Generating grounded response..."

COMPLETED:
show generated draft

FAILED:
show useful failure state and allow retry by requesting a fresh suggestion

STALE:
show:
"Conversation changed while this suggestion was being generated. Generate a new suggestion."

Do not allow stale suggestions to be accepted.

--------------------------------------------------
7. CITATIONS
--------------------------------------------------

For COMPLETED suggestions, parse/display citation markers such as:

[1]
[2]
[3]

Show citation cards under the draft.

Each citation should display information available from API:
- citation number
- PDF page number when available
- similarity score
- document identifier or document name if available
- optionally a short source preview if API data allows it

Example visual idea:

Source [2]
Page 4
Similarity: 0.78

Do not expose raw vector data.

TXT sources may have page_number = null.
Handle that gracefully.

Agent should clearly understand which claims are grounded by which KB source.

--------------------------------------------------
8. ACCEPT / EDIT / REJECT
--------------------------------------------------

For COMPLETED suggestions provide:

Accept
Edit & Send
Reject

ACCEPT:
- submit ACCEPTED feedback
- backend sends the AI draft as AGENT_REPLY
- refresh conversation afterward
- customer-facing message should already come back citation-free

EDIT:
- make suggestion editable in frontend
- agent modifies the response
- send EDITED feedback with final_text
- refresh conversation afterward

REJECT:
- send REJECTED
- no customer-visible message should appear

Handle duplicate-feedback 409 cleanly.

--------------------------------------------------
9. ATTACHMENTS
--------------------------------------------------

If practical in this phase, integrate existing attachment flow:

- obtain presigned upload URL
- PUT file directly to S3
- confirm upload
- show uploaded attachment
- authenticated download

Do not proxy file bytes through FastAPI if the existing architecture uses direct S3 upload.

If this significantly blocks the core frontend, complete AI/ticket workflow first and return to attachments afterward.

==================================================
STATE / API ARCHITECTURE
==================================================

Keep the frontend understandable.

Prefer something like:

src/
  api/
  components/
  features/
    auth/
    tickets/
    ai/
  hooks/
  pages/
  types/
  utils/

Do not introduce Redux unless there is a strong reason.

React Context, hooks, or a lightweight state approach is sufficient.

A small API client wrapper is desirable for:
- base URL
- Authorization header
- refresh handling
- consistent error parsing

If the project already has a usable structure, improve it instead of replacing everything.

==================================================
UI STYLE
==================================================

Professional enterprise SaaS.

Prioritize:
- information density
- readability
- clear hierarchy
- good loading states
- useful empty states
- sensible spacing

Avoid:
- excessive gradients
- neon AI aesthetic
- huge hero sections
- decorative animations
- overly rounded everything
- generic landing-page UI

This is an internal support application.

Use the project's existing styling approach if present.
If there is no established design system, choose a lightweight maintainable approach.

Do not add a huge component library unless it materially helps.

==================================================
ERROR HANDLING
==================================================

Handle at minimum:

401:
attempt refresh, otherwise login

403:
clear permission error

404:
resource not found

409:
claim conflict
invalid/stale operation
duplicate AI feedback

422:
validation issue

500:
generic error with retry where appropriate

AI statuses must not be treated as synchronous responses.

==================================================
IMPORTANT ENGINEERING RULES
==================================================

1. Do not break working backend behavior.

2. Do not change database migrations unless genuinely required.

3. Do not modify backend authentication architecture just to make frontend easier.

4. Do not put secrets in frontend code.

5. Do not hardcode AWS credentials, Gemini keys, JWT secrets, IDs or passwords.

6. Do not expose refresh tokens to JavaScript if backend already uses HttpOnly cookies.

7. Do not silently create new API contracts.

8. If an endpoint response differs from expectation, inspect the actual backend implementation.

9. Keep TypeScript types aligned with actual Pydantic responses.

10. Avoid `any` unless unavoidable.

11. Keep components reasonably small.

12. Avoid one giant App.tsx.

13. Do not add unnecessary dependencies.

14. Preserve Docker compatibility.

15. Do not remove existing functionality merely because it is currently unused by the frontend.

==================================================
TESTING
==================================================

After implementation:

- run frontend build
- fix TypeScript errors
- verify Docker frontend build
- test core API integration

At minimum manually validate:

Agent login
→ Assigned to Me queue
→ open ticket
→ conversation loads
→ send agent reply
→ generate AI suggestion
→ queued/processing state
→ completed suggestion
→ citations visible
→ Accept produces AGENT_REPLY
→ Edit produces edited AGENT_REPLY
→ Reject sends nothing
→ stale suggestion is blocked

Also validate:
- expired access token refresh behavior
- unauthorized customer cannot use agent UI

==================================================
WORKING STYLE
==================================================

Work incrementally.

Before large changes:
- inspect existing files
- understand what already works

After each meaningful phase:
- run relevant build/tests
- fix errors before continuing

Do not generate hundreds of lines blindly and leave compilation failures for later.

If you discover a backend integration bug:
- explain the specific bug
- make the smallest reasonable backend fix
- do not redesign unrelated backend code

Where decisions are ambiguous, favor:
- simplicity
- maintainability
- demo quality
- code I can explain in an interview

==================================================
DELIVERABLE
==================================================

Implement the Agent frontend first.

When done, provide a concise summary containing:

1. Files created/modified
2. Main UI flows implemented
3. APIs integrated
4. Any backend changes and why
5. Remaining frontend gaps
6. Commands to run/test the project
7. Any important design decisions I should understand for interviews

Start by inspecting the repository. Do not begin by rewriting files.