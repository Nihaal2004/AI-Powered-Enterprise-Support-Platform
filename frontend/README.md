# Agent workspace — Phases 1, 2 and 3

React, strict TypeScript, Vite and plain CSS. No additional dependencies.

## Ticket search and workflow

Both queues support combined title/ticket-ID/customer-ID search, status (including active tickets), priority, customer urgency, and created/updated date filters. Date presets and inclusive custom date ranges use the browser's local time zone. Sort by activity, creation date, or priority; results paginate at 20 tickets. Views are remembered per queue in session storage, including when returning from a ticket. Search and filters apply to the complete loaded queue, before pagination.

Status and priority selections are drafts until applied. Resolving or permanently closing a ticket requires an explicit confirmation action. Resolved tickets block replies, message edits/deletes, new attachments, claiming and priority changes; the assigned agent can explicitly reopen them or close them. Closed tickets cannot be reopened. Internal notes remain available for staff follow-up. These restrictions also run in the backend, and ticket responses now expose existing lifecycle timestamps (no database migration required). Deploy backend and frontend together for date filters.

## Visual system

`src/styles/tokens.css` defines the shared dark palette, semantic colors, spacing, typography, radii and shadows. `src/index.css` supplies reusable buttons, forms, badges, focus states and feedback treatments. `src/App.css` lays out a dark graphite navigation sidebar and layered main work surfaces. AI-specific presentation lives in `src/features/ai/ai.css` and uses the same tokens. Dark mode is the default; no theme-toggle feature or persistence is added.

Surfaces progress from the near-black canvas to charcoal panels and elevated popovers, with cool white text and mint primary actions. Customer/agent messages, internal-only badges, status/priority chips, errors and citations retain distinct treatments. Inputs, native selects, scrollbars, text selection, hover and keyboard-focus states are dark-aware. A one-off luminance check verified 34 color pairs: all checked normal-text pairs exceed 4.5:1 (minimum 5.67:1), and checked interactive control borders exceed 3:1. These checks cover token pairs, not a full rendered accessibility audit.

The visual redesign references [Linear's published UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) for alignment, headers and navigation hierarchy, [Intercom's inbox layouts](https://www.intercom.com/help/en/articles/7911926-customize-the-inbox-to-suit-you-and-how-you-work-best) for separating queue scanning from conversation work, and [Front's composer documentation](https://help.front.com/en/articles/2218) for clear composition context. These are design references; no extra product features are implemented.

The navigation rail is 216px on desktop and 184px on smaller laptops. Main content is capped at 1280px with 20–44px side gutters. Queues use aligned ticket/status/priority/assignment columns and 86px minimum rows, with assignment moving below the title when space is limited. Ticket headers form a distinct raised masthead with compact icon tabs beneath. Conversations use 14px body text, 30px participant avatars and a fixed composer below the scrollable thread. Internal notes have a timeline and separate composing card; AI has a section header, reading surface and responsive source cards. Existing API behavior and retained section state are unchanged.

For immediate review while the Docker-served frontend still has an older bundle, the current development preview runs at `http://localhost:5174`. It uses the existing Vite `/api` proxy to the backend on port 8000.

Priority colors are green-neutral (LOW), amber (MEDIUM), orange (HIGH) and red (CRITICAL). Ticket states have distinct badges; AI queued, processing, ready, stale, failed and feedback dispositions have separate treatments. Primary actions use restrained teal/charcoal, Accept uses confirm green, and Reject uses an outlined negative treatment. Sources and citation notes remain secondary to the draft or final sent text.

The application uses two structural columns: navigation and main content. Account/logout sits at the bottom of the sidebar. Tickets has its own full-width queue screen; a selected ticket has a shared title/identifier/status/priority/assignment header and four route-backed task sections. Below 640px the sidebar stacks above content. System fonts, semantic colors and existing feature components are reused.

## Screens and routes

| Route | Screen |
| --- | --- |
| `/tickets` | Assigned to Me queue |
| `/tickets?queue=unassigned` | Unassigned queue |
| `/tickets/:ticketId/overview` | Ticket metadata and claim |
| `/tickets/:ticketId/conversation` | Conversation, replies, editing/deletion and attachments |
| `/tickets/:ticketId/notes` | Internal notes list and composer |
| `/tickets/:ticketId/ai` | AI generation, citations, feedback, final response and provenance |

`/` redirects to `/tickets`; a bare `/tickets/:ticketId` opens its conversation. Unknown sections show a not-found screen. Queue rows and section navigation are real links, supporting new tabs as well as browser back/forward. The small History API adapter in `src/navigation/` adds no dependency. Vite's SPA fallback and nginx's existing `try_files` restore nested URLs after reload. Authentication runs before route content; the current URL remains intact during login/session restoration.

`AppShell` owns sidebar/main layout. `AgentWorkspace` dispatches routes to `TicketsPage` or `TicketPage`. The ticket page owns the existing detail/conversation reload and mutation wiring. `TicketHeader` supplies shared metadata and section links; `TicketOverview` groups the existing details/controls. Conversation, InternalNotes and AiAssistantPanel retain their existing API logic in separate screen boundaries.

The primary **Update ticket** action sits at the right of the shared section-navigation row on every ticket screen. It opens the existing status/priority controls in a compact anchored popover, without taking more space from the conversation. Outside click or Escape closes it. Overview retains metadata and claim, without a duplicate update form. The same API adapter, validation guidance, mutation handlers, errors and refresh behavior are reused.

`RetainedSection` mounts each section only on its first visit, then hides inactive sections using the HTML `hidden` attribute. Only one task participates in layout, keyboard focus or the accessibility tree. Within the selected ticket, sections remain mounted so reply drafts/files/upload-retry IDs, note drafts, AI suggestion/polling, edited AI text, feedback and provenance survive section navigation. Background reload errors do not unmount those sections. Leaving the ticket or signing out disposes its state and stops polling as before. Reload restores the section URL and server conversation/notes; unsent drafts and the current AI suggestion remain session memory, as in the original implementation. No new AI lookup/persistence behavior was added.

The conversation screen now fits within the desktop content viewport: the thread scrolls independently above the reply composer. Messages retain backend chronological order, opening at the latest reply at the bottom. Short threads align to the bottom too. New messages, attachment metadata and composer resizing keep the latest reply visible while the agent is at the end; scrolling into older history suspends automatic following. Section navigation preserves that reading position. A successful own reply resumes following the latest message. `ResizeObserver` handles asynchronous layout changes without polling or API changes.

Conversation now uses an edge-to-edge desktop work area beside the navigation rail, without the other pages' outer gutters or content-width cap. A compact title/back/metadata toolbar and flat section navigation replace the large ticket masthead on this screen. The duplicate conversation heading is removed. A two-row reply input and a single attachment/count/send toolbar reduce composer height; message bubbles fit their content instead of stretching short replies across wide cards. Other sections retain their normal spacing and masthead. The optional browser check asserts that the message viewport receives at least 60% of a 768px-high desktop screen at 1024/1280/1440px widths; execution still requires available Chromium access.

Unassigned ticket links carry `?queue=unassigned` through all ticket sections, so All tickets returns to that queue. Ticket details and conversation load independently: a conversation fetch failure is shown with its own retry and does not block Overview, Internal Notes or AI Assistant. Existing loaded conversation/draft state stays mounted on refresh errors.

The updated internal-notes GET and POST responses both supply required `author_email`. The frontend type and note timeline use that email, with a separate You label on the signed-in agent's notes. Failed note loads do not imply an empty timeline; load/reload errors and save errors are separate. There are no backend edits in this UI pass.

## Run

From `frontend/`, run `npm ci` and `npm run dev`. Vite forwards `/api/*` to FastAPI at `http://localhost:8000`, removing `/api`.

For Docker, from the project root run `docker compose up -d --build frontend`. Open `http://localhost:5173`. Use an existing AGENT account; the UI does not create accounts or elevate roles.

## Verify

From `frontend/`:

```powershell
npm run build
npm run lint
npm test
```

Real API integration checks, from the project root with the backend and PostgreSQL running:

```powershell
Get-Content -Raw tests/agent_phase1_api.py | docker exec -i enterprisesupportplatform-backend-1 python -
Get-Content -Raw tests/agent_phase2_api.py | docker exec -i -e PYTHONDONTWRITEBYTECODE=1 enterprisesupportplatform-backend-1 python -
```

The integration script uses FastAPI's ASGI transport and the real PostgreSQL schema. It overrides only the database dependency, binds requests to one outer transaction, and rolls back all temporary accounts, tickets, refresh sessions and replies. Do not run it concurrently inside the same Python process as other ASGI tests.

Production image verification:

```powershell
docker compose build frontend
```

Manual browser flow:

1. Sign in using an AGENT account. Check incorrect-password errors.
2. Open Assigned to Me, select a ticket and inspect its conversation and details.
3. Open Unassigned, select a ticket and claim it. The selected ticket stays open while it leaves the Unassigned list.
4. Open Assigned to Me again and select the claimed ticket. Send a reply and verify it appears as a support-agent message. Whitespace-only replies are blocked; failed requests retain the draft.
5. Refresh the page. The HttpOnly refresh cookie restores the session without browser-stored access tokens.
6. After access-token expiry, refresh the queue or send a reply. Verify one `/api/auth/refresh` request followed by the retried request. Signing out returns to login, and reloading stays signed out.
7. Sign in as CUSTOMER or ADMIN. The agent workspace must remain inaccessible.
8. With two agents, open the same unassigned ticket and claim from both sessions. The losing session displays the backend conflict and reloads current assignment.

## Contracts and decisions

- `api/client.ts`: in-memory access token, shared refresh promise for concurrent 401 responses, one retry, error parsing and logout revocation. Login validates the identity using `/auth/me`.
- `api/types.ts`: fields from the backend Pydantic response schemas; no guessed customer/category names or ticket timestamps.
- `api/tickets.ts`: queue, details, conversation, claim and reply requests.
- `features/auth/Login.tsx`: sign-in form. `App.tsx` restores sessions and gates the workspace on the AGENT role.
- `features/tickets/`: queue, route/page orchestration, conversation, details and label formatting. Ticket loads are cancelled when selection changes. Drafts belong to the selected ticket, survive section navigation and reset when switching tickets.
- Both Vite and nginx strip `/api` upstream and map the backend cookie path `/auth` to browser path `/api/auth`. This preserves HttpOnly cookie handling and refresh rotation without changing FastAPI.
- `TicketResponse` supplies UUIDs for customer/category and no timestamps or names. Those IDs are labelled explicitly; queue ordering comes directly from the backend's latest-message ordering.
- No backend application code, models, migrations, dependency versions or secrets were changed.

## Scope and remaining work

Phase 1 includes login/logout, role protection, both queues, ticket selection, conversation, read-only details, claim and agent replies. Build, lint, client tests, transaction-isolated API tests and Docker image checks are automated; interactive browser validation remains a manual step.

Phase 2 supplies the AI Assistant, now presented at `/tickets/:ticketId/ai`. The existing login/refresh client, queues, claim and normal reply flow remain in place.

## Phase 2 AI workflow

Exact FastAPI routes (the frontend prefixes each with `/api`):

- `POST /tickets/{ticket_id}/ai-suggestions`: no request body; returns 202 and an `AISuggestionResponse`.
- `GET /ai-suggestions/{suggestion_id}`: polls the response's status, draft and citations.
- `POST /ai-suggestions/{suggestion_id}/feedback`: returns 201. ACCEPTED and REJECTED send only `feedback_type`; EDITED also sends `final_text`.

`src/api/ai.ts` is the typed adapter. `src/features/ai/` contains response types, the controller/hook, panel, draft/actions, citation cards and styles. `TicketPage.tsx` hosts the retained AI section and triggers the existing conversation reload after successful ACCEPTED or EDITED feedback. Returning to Tickets reloads the queue. No extra message POST is made.

The controller publishes the POST response immediately, then schedules GETs two seconds after the previous request settles. It stops on COMPLETED, FAILED or STALE, after three consecutive transient failures, or at a three-minute deadline. HTTP 4xx polling failures stop immediately. Replacing the suggestion or disposing the hook on ticket change/unmount clears timers, aborts outstanding requests and ignores late results. Feedback has a 30-second request timeout; an unconfirmed result asks the agent to refresh before retrying.

Generation requires assignment to the signed-in agent and an unresolved/open ticket. The backend remains authoritative for permissions and conversation versions. STALE suggestions have no feedback controls. Any feedback 409 (stale, duplicate or invalid state) blocks further actions on that suggestion and prompts fresh generation. A successful rejection is shown explicitly and does not reload/create a customer message.

Draft text is rendered as plain text with all `[n]` markers intact. Citation cards are keyed and labelled using `citation`, never array position. Only returned metadata is displayed: page when present, similarity, document ID and chunk index. Null pages and missing metadata are omitted. Empty citation lists explain that evidence may be insufficient. Raw worker `failure_reason` and server 500 details are not rendered.

Backend contract observations: `citations` is an unstructured Pydantic list; frontend citation fields follow `CitationService.build_citations`. There is no structured abstention flag, so a COMPLETED no-citation result remains reviewable with an evidence notice. Ticket replies/edits/deletes increment `conversation_version`; feedback validates the captured version and returns 409/marks STALE when it changes. No backend changes were necessary.

### Phase 2 checks

`npm test` runs the existing client tests plus fake-timer controller, API adapter and server-rendered component tests, using the installed TypeScript compiler and Node 22.20+ test tooling. No new test dependencies. They cover transitions, terminal stops, cancellation/late responses, replacement, non-overlap, finite timeout, repeated failures, non-contiguous sources, empty evidence, exact feedback payloads and 409 blocking.

`tests/agent_phase2_api.py` verifies real FastAPI/PostgreSQL request/outbox/feedback semantics in a rolled-back transaction. Worker result states are deterministic fixtures; it does not deliver RabbitMQ events or call Gemini. A local headless Chrome check with deterministic API fixtures verified the full interaction flow and absence of JavaScript errors. Live external-worker generation still requires the following manual check.

Manual live-worker flow:

1. Run the frontend with the existing backend, outbox publisher, RabbitMQ and AI worker. Use an indexed KB document relevant to the ticket.
2. Sign in as AGENT, open Assigned to Me and select an unresolved ticket.
3. Click Generate AI Suggestion. Check queued/processing state, then COMPLETED with its draft and sources (fast processing may skip a visible intermediate state).
4. Click Accept. Verify one AGENT_REPLY appears and its text has no citation markers. Do not expect a second message POST in the network log.
5. Generate a fresh suggestion, choose Edit & Send, change the text and send. Verify one edited citation-free reply.
6. Generate again and Reject. Verify the rejection notice and no new customer message.
7. Generate, wait for completion, then send a normal reply (or have the customer reply). Accept the old suggestion: expect 409 and blocked actions. Generate fresh to continue. A change while the worker is running can also produce STALE directly.
8. Switch tickets while polling and confirm no further GETs for the old suggestion. Verify generation is disabled on unassigned, resolved and closed tickets.

## Phase 3 ticket operations

Internal notes live in their own ticket section labelled INTERNAL, with muted note surfaces, author email and timestamp metadata. They use their own requests and state and never enter the customer conversation or trigger its reload. Agents can view/add notes without claiming a ticket, matching the backend.

Status and priority selects live in Overview, use the existing semantic badges and refresh ticket details after mutations. Returning to Tickets reloads the queue. Status options follow the backend transition map, including OPEN → RESOLVED and terminal CLOSED. Assignment guides status access and priority downgrades; backend validation remains authoritative for stale permissions, conflicts and validation errors.

Own, undeleted AGENT_REPLY messages show compact Edit/Delete actions during the backend's 15-minute window. MessageResponse has no eligibility flags, so ownership/type/timestamps provide guidance only. Delete requires explicit confirmation. Successful edits/deletions reload the conversation; deleted text comes from the backend placeholder, with message IDs/history preserved. Backend 403/409/422 explanations stay visible. Server 5xx details are suppressed globally.

The reply composer supports one file per send, up to the schema's 10 MB limit. A nonblank body is always required. It first saves the message, requests a presigned URL, PUTs bytes directly to S3 without cookies or app Authorization, and confirms with FastAPI. Upload/confirmation loading, errors and success are shown. Failed uploads retain the saved message ID for retry without reposting its body; agents can also finish without the attachment. Each live message loads its confirmed attachment metadata separately, with filename, size/type and authenticated download actions. Download requests return a short-lived S3 URL; no file bytes pass through FastAPI. S3 must allow browser PUT requests from the frontend origin with the Content-Type header.

Attachment CORS setup: the S3 client explicitly signs regional, virtual-hosted URLs to avoid global-endpoint redirects during browser preflight. The bucket must also allow the frontend's exact origin. `frontend/config/s3-cors.local.json` supplies the local-development rule for the S3 console; merge it with existing CORS rules. Alternatively, run the following from the project root to merge the rule using the backend's existing server-side credentials (requires bucket CORS permissions), then restart the backend to load the regional endpoint change:

```powershell
Get-Content -Raw backend/scripts/configure_attachment_cors.py | docker exec -i enterprisesupportplatform-backend-1 python -
docker restart enterprisesupportplatform-backend-1
```

The script preserves existing production/knowledge-base rules. No credentials or file bytes pass through the frontend/backend proxy. Browser network errors now identify presign, storage PUT or confirmation failures without disclosing signed URLs. These code changes do not themselves modify AWS bucket configuration; the setup command must succeed before CORS is considered fixed.

Exact new backend routes (browser API requests add `/api`):

| Method | Route | Request |
| --- | --- | --- |
| GET / POST | `/tickets/{ticket_id}/internal-notes` | POST `{body}` |
| PATCH | `/tickets/{ticket_id}/status` | `{status}` |
| PATCH | `/tickets/{ticket_id}/priority` | `{priority}`; backend optional reason omitted |
| PATCH / DELETE | `/tickets/{ticket_id}/messages/{message_id}` | PATCH `{body}` |
| POST | `/tickets/{ticket_id}/messages/{message_id}/attachments/presign` | `{filename, mime_type, size_bytes}` |
| POST | `/tickets/{ticket_id}/messages/{message_id}/attachments/{attachment_id}/confirm` | No body |
| GET | `/tickets/{ticket_id}/messages/{message_id}/attachments` | No body |
| GET | `/tickets/{ticket_id}/messages/{message_id}/attachments/{attachment_id}/download` | No body |

No backend changes, schema mismatches, new dependencies or auth/AI architecture changes were required. API limitations: no message eligibility fields, no atomic reply-with-attachment operation, no batch attachment metadata endpoint. The UI works with those contracts instead of adding endpoints.

`tests/phase3.test.mjs` adds API contract/error tests, message eligibility checks, server-rendered separation/placeholder/control checks, direct-upload sequencing and credential isolation, and queue/claim/reply regression checks. These use mocked fetch and do not substitute for a real browser/S3/worker run.

Phase 3 live verification checklist:

1. Sign in as AGENT, open Assigned to Me and select a ticket.
2. Save an internal note; verify it appears only in INTERNAL and not in customer messages.
3. Change priority/status; verify badges, details and queue update. Check an unassigned priority raise and disabled downgrade/status controls.
4. Edit a recent own agent reply; verify edited state after reload. Verify old/other-agent/deleted messages have no mutation controls.
5. Delete a recent own reply, confirm, and verify the backend placeholder survives a reload.
6. Send a nonblank reply with a file; verify presign → S3 PUT → confirm, uploaded metadata and authenticated download. Simulate upload failure and retry without a duplicate reply.
7. Recheck the Phase 1 auth/refresh and Phase 2 AI/citation/feedback/stale flows above.

Remaining scope: single-file selection per reply (the backend supports multiple attachments via repeated uploads), no byte-percentage progress (loading is shown), and no revision-history viewer. Live browser/S3/worker validation and Docker verification must be completed where authorized account/browser and Docker access are available.

## Information architecture verification

`tests/navigation.test.mjs` covers nested routes, queue-to-ticket links, section navigation, Overview isolation, lazy section boundaries, sidebar hierarchy and browser-history subscriptions. Existing auth, AI and attachment tests remain unchanged.

`tests/browser-navigation.test.mjs` is an optional real Chromium test using the production build, an isolated temporary browser profile and deterministic fetch fixtures. It covers actual section switching, retained reply/file/AI edit state, polling while another section is shown, feedback persistence with no separate message POST, note separation, Overview controls, attachment upload/download metadata, auth refresh, every direct section URL and laptop overflow. It never contacts the real backend, S3 or AI providers. Without `BROWSER_BIN`, the normal test run explicitly skips this browser check.

```powershell
npm run build
$env:BROWSER_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test tests/browser-navigation.test.mjs
```

The information architecture refactor passed the production build, lint and non-browser tests. This environment denied Docker configuration/daemon access, and elevated command startup failed for both Docker and Chromium. Docker image verification and execution of the optional Chromium check remain pending; the test source alone is not evidence of those checks passing.

`tests/ui-refinement.test.mjs` verifies latest-message positioning, preserving older-history position, hidden-section/attachment resize behavior, author-email rendering, chronological conversation order and Unassigned queue context. Browser fixtures also cover a long conversation, composer visibility and retained scroll position. Production build, ESLint and 53 non-browser tests pass; the optional Chromium check remains skipped because elevated browser process startup failed in this environment.
