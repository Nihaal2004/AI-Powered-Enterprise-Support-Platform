import './support/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { createConversationScroll } = await import('../src/features/tickets/conversationScroll.ts');
const { InternalNoteItem } = await import('../src/features/tickets/InternalNoteItem.tsx');
const { TicketHeader } = await import('../src/features/tickets/TicketHeader.tsx');
const { TicketQueue } = await import('../src/features/tickets/TicketQueue.tsx');
const { TicketUpdate } = await import('../src/features/tickets/TicketUpdate.tsx');
const { Conversation } = await import('../src/features/tickets/Conversation.tsx');
const { ticketPath, parseRoute } = await import('../src/navigation/routes.ts');
const ticket = { id: 't', title: 'Sign in help', assigned_agent_id: 'agent', status: 'OPEN', priority: 'MEDIUM', customer_urgency: 'NORMAL' };
const render = (component, props) => renderToStaticMarkup(createElement(component, props));

function viewport() {
  let top = 0;
  return {
    clientHeight: 300, scrollHeight: 1200,
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
  };
}

test('conversation opens at the latest message and follows late attachment/layout growth', () => {
  const element = viewport(); const scrolling = createConversationScroll(element);
  scrolling.sync(); assert.equal(element.scrollTop, 900);
  element.scrollHeight = 1400; scrolling.sync(); assert.equal(element.scrollTop, 1100);
  element.clientHeight = 250; scrolling.sync(); assert.equal(element.scrollTop, 1150);
});

test('reading older messages preserves position across updates and section switches', () => {
  const element = viewport(); const scrolling = createConversationScroll(element);
  scrolling.sync(); element.scrollTop = 300; scrolling.onScroll();
  element.scrollHeight = 1600; scrolling.sync(); assert.equal(element.scrollTop, 300);
  element.clientHeight = 0; scrolling.onScroll(); scrolling.sync();
  element.clientHeight = 300; scrolling.sync(); assert.equal(element.scrollTop, 300);
  scrolling.latest(); assert.equal(element.scrollTop, 1300);
});

test('hidden retained conversation still follows latest when reopened if it was at the end', () => {
  const element = viewport(); const scrolling = createConversationScroll(element);
  scrolling.sync(); element.clientHeight = 0; scrolling.onScroll();
  element.scrollHeight = 1800; scrolling.sync();
  element.clientHeight = 300; scrolling.sync(); assert.equal(element.scrollTop, 1500);
});

test('internal notes display API author email, own-note identity and escaped plain text', () => {
  const note = { id: 'note', author_user_id: 'agent', author_email: 'support@example.test', body: '<script>private context</script>', created_at: '2026-10-18T12:00:00Z' };
  const own = render(InternalNoteItem, { note, userId: 'agent' });
  assert.match(own, /support@example.test/); assert.match(own, />You</);
  assert.doesNotMatch(own, /Agent agent|<script>/); assert.match(own, /&lt;script&gt;/);
  assert.doesNotMatch(render(InternalNoteItem, { note, userId: 'other' }), />You</);
});

test('Unassigned context survives ticket selection and all section links', () => {
  const path = ticketPath('t', 'conversation', 'unassigned');
  assert.equal(path, '/tickets/t/conversation?queue=unassigned');
  assert.deepEqual(parseRoute(path), { kind: 'ticket', ticketId: 't', section: 'conversation' });
  const rows = render(TicketQueue, { queue: 'unassigned', tickets: [{ ...ticket, assigned_agent_id: null }], loading: false, error: '', onRefresh() {} });
  assert.match(rows, /href="\/tickets\/t\/conversation\?queue=unassigned"/);
  const header = render(TicketHeader, { ticket, userId: 'agent', section: 'overview', queue: 'unassigned' });
  for (const section of ['overview', 'conversation', 'notes', 'ai']) assert.ok(header.includes(`/tickets/t/${section}?queue=unassigned`));
});

test('conversation retains chronological history and exposes the existing Overview claim route', () => {
  const messages = [
    { id: 'old', ticket_id: 't', author_user_id: 'customer', message_type: 'CUSTOMER_REPLY', body: 'Earlier question', created_at: '2026-10-18T11:00:00Z', attachments: [] },
    { id: 'new', ticket_id: 't', author_user_id: 'agent', message_type: 'AGENT_REPLY', body: 'Latest answer', created_at: '2026-10-18T12:00:00Z', attachments: [] },
  ];
  const markup = render(Conversation, { api: {}, userId: 'agent', onChanged() {}, ticket: { ...ticket, assigned_agent_id: null }, messages, canReply: false, onReply: async () => messages[1], queue: 'unassigned' });
  assert.ok(markup.indexOf('Earlier question') < markup.indexOf('Latest answer'));
  assert.match(markup, /href="\/tickets\/t\/overview\?queue=unassigned"/);
  assert.match(markup, /messages-content/); assert.match(markup, /composer-heading/);
});

test('compact conversation header retains ticket identity, badges, assignment and queue navigation', () => {
  const markup = render(TicketHeader, { ticket, userId: 'agent', section: 'conversation', queue: 'unassigned', compact: true });
  assert.match(markup, /ticket-heading-compact/);
  assert.match(markup, /Sign in help/);
  assert.match(markup, /status-open/); assert.match(markup, /priority-medium/);
  assert.match(markup, /Assigned to you/);
  assert.match(markup, /href="\/tickets\?queue=unassigned"/);
  assert.equal((markup.match(/<h1/g) ?? []).length, 1);
});

test('Update ticket is available in the shared header of every section with one set of existing controls', () => {
  for (const section of ['overview', 'conversation', 'notes', 'ai']) {
    const actions = createElement(TicketUpdate, { api: {}, ticket, userId: 'agent', onUpdated() {}, onRefresh() {} });
    const markup = render(TicketHeader, { ticket, userId: 'agent', section, compact: section === 'conversation', actions });
    assert.match(markup, /<summary>Update ticket/);
    assert.equal((markup.match(/aria-label="Ticket status"/g) ?? []).length, 1);
    assert.equal((markup.match(/aria-label="Ticket priority"/g) ?? []).length, 1);
    assert.match(markup, /ticket-navigation-row/);
  }
});
