import './support/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { filterTickets, defaultFilters, invalidDateRange, readFilters } = await import('../src/features/tickets/queueFilters.ts');
const { Conversation } = await import('../src/features/tickets/Conversation.tsx');
const { TicketControls } = await import('../src/features/tickets/TicketControls.tsx');
const { TicketDetails } = await import('../src/features/tickets/TicketDetails.tsx');
const { TicketQueue } = await import('../src/features/tickets/TicketQueue.tsx');
const now = new Date(2026, 9, 19, 12).getTime();
const ticket = { id: 'abc-123', customer_id: 'customer-1', title: 'Account access problem', assigned_agent_id: 'agent', status: 'OPEN', priority: 'MEDIUM', customer_urgency: 'NORMAL', created_at: new Date(now - 86400000).toISOString(), last_message_at: new Date(now - 1000).toISOString() };
const fixtures = [ticket, { ...ticket, id: 'def-456', title: 'Billing problem', status: 'RESOLVED', priority: 'CRITICAL', customer_urgency: 'URGENT', created_at: new Date(now - 40 * 86400000).toISOString(), updated_at: new Date(now).toISOString() }];
const filter = values => filterTickets(fixtures, { ...defaultFilters, ...values }, now);
const render = (component, props) => renderToStaticMarkup(createElement(component, props));

test('search matches words, ticket references and customer IDs, combined with all selected filters', () => {
  assert.deepEqual(filter({ search: 'ACCESS account', priority: 'MEDIUM', status: 'ACTIVE', urgency: 'NORMAL', period: '7' }).map(t => t.id), ['abc-123']);
  assert.equal(filter({ search: '#abc' }).length, 1);
  assert.equal(filter({ search: 'customer-1' }).length, 2);
  assert.equal(filter({ status: 'ACTIVE', priority: 'CRITICAL' }).length, 0);
  assert.equal(filter({ status: 'RESOLVED', urgency: 'URGENT' })[0].id, 'def-456');
});

test('date presets use the chosen timestamp and exclude missing dates', () => {
  assert.equal(filter({ period: '7' })[0].id, 'abc-123');
  assert.equal(filter({ period: 'TODAY', dateField: 'updated_at' })[0].id, 'def-456');
  assert.equal(filter({ period: 'TODAY' }).length, 0);
});

test('custom date range includes the entire local end day and rejects reversed ranges', () => {
  const endOfDay = { ...ticket, created_at: new Date(2026, 9, 18, 23, 59, 59, 999).toISOString() };
  const nextDay = { ...ticket, created_at: new Date(2026, 9, 19, 0).toISOString() };
  const filters = { ...defaultFilters, period: 'CUSTOM', from: '2026-10-18', to: '2026-10-18' };
  assert.deepEqual(filterTickets([endOfDay, nextDay], filters, now), [endOfDay]);
  assert.equal(invalidDateRange({ ...filters, from: '2026-10-20' }), true);
  assert.equal(filterTickets(fixtures, { ...filters, from: '2026-10-20' }, now).length, 0);
});

test('priority and created-date sorting preserve the original API array', () => {
  assert.equal(filter({ sort: 'priority' })[0].priority, 'CRITICAL');
  assert.equal(filter({ sort: 'oldest' })[0].id, 'def-456');
  assert.equal(filter({ sort: 'newest' })[0].id, 'abc-123');
  assert.equal(fixtures[0].id, 'abc-123');
});

test('saved views tolerate corrupt storage and validate enum choices', () => {
  globalThis.sessionStorage = { getItem: () => '{broken' };
  assert.deepEqual(readFilters('view'), defaultFilters);
  globalThis.sessionStorage = { getItem: () => JSON.stringify({ search: 'billing', status: 'UNKNOWN', sort: 'priority', from: 'invalid' }) };
  assert.deepEqual(readFilters('view'), { ...defaultFilters, search: 'billing', sort: 'priority' });
  delete globalThis.sessionStorage;
});

test('resolved and closed tickets block replies, files, message edits, priority and claiming', () => {
  const message = { id: 'm', ticket_id: ticket.id, author_user_id: 'agent', message_type: 'AGENT_REPLY', body: 'Already sent', created_at: new Date().toISOString(), attachments: [] };
  for (const status of ['RESOLVED', 'CLOSED']) {
    const locked = { ...ticket, status };
    const conversation = render(Conversation, { api: {}, userId: 'agent', ticket: locked, messages: [message], canReply: true, onChanged() {}, onReply: async () => message });
    assert.match(conversation, /id="reply"[^>]*disabled/);
    assert.match(conversation, /type="file"[^>]*disabled/);
    assert.doesNotMatch(conversation, />Edit<|>Delete</);
    const controls = render(TicketControls, { api: {}, ticket: locked, userId: 'agent', onUpdated() {}, onRefresh() {} });
    assert.match(controls, /aria-label="Ticket priority" disabled/);
    if (status === 'RESOLVED') assert.match(controls, /Reopen ticket/);
    else assert.match(controls, /aria-label="Ticket status" disabled/);
    assert.doesNotMatch(render(TicketDetails, { ticket: { ...locked, assigned_agent_id: null }, userId: 'agent', onClaim() {} }), /Claim ticket/);
  }
});

test('queue exposes search, date, priority, urgency, sort and pagination with result counts', () => {
  const markup = render(TicketQueue, { queue: 'assigned_to_me', tickets: Array.from({ length: 21 }, (_, i) => ({ ...ticket, id: String(i) })), loading: false, error: '', onRefresh() {} });
  for (const text of ['Search tickets', 'Time period', 'All priorities', 'All urgency levels', 'Sort by', '21 of 21 tickets', 'Page 1 of 2']) assert.ok(markup.includes(text));
  assert.equal((markup.match(/class="ticket-row"/g) ?? []).length, 20);
});
