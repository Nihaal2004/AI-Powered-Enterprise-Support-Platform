import './support/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { parseRoute, ticketPath, queuePath, navigate, getLocation, subscribeLocation } = await import('../src/navigation/routes.ts');
const { RouteLink } = await import('../src/navigation/RouteLink.tsx');
const { TicketQueue } = await import('../src/features/tickets/TicketQueue.tsx');
const { TicketHeader } = await import('../src/features/tickets/TicketHeader.tsx');
const { TicketOverview } = await import('../src/features/tickets/TicketOverview.tsx');
const { RetainedSection } = await import('../src/features/tickets/RetainedSection.tsx');
const { AppShell } = await import('../src/components/AppShell.tsx');
const ticket = { id: 'ticket-1', title: 'Account access', customer_id: 'customer-1', primary_category_id: 'category-1', assigned_agent_id: 'agent', customer_urgency: 'URGENT', status: 'OPEN', priority: 'MEDIUM' };
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));

test('direct nested routes restore the correct ticket and section; invalid routes are rejected', () => {
  for (const section of ['overview', 'conversation', 'notes', 'ai']) {
    assert.deepEqual(parseRoute(`/tickets/ticket-1/${section}`), { kind: 'ticket', ticketId: 'ticket-1', section });
  }
  assert.deepEqual(parseRoute('/tickets/ticket-1'), { kind: 'ticket', ticketId: 'ticket-1', section: 'conversation' });
  assert.deepEqual(parseRoute('/'), { kind: 'tickets', queue: 'assigned_to_me' });
  assert.deepEqual(parseRoute('/tickets?queue=unassigned'), { kind: 'tickets', queue: 'unassigned' });
  for (const path of ['/other', '/tickets/id/unknown', '/tickets/%/notes', '/tickets/a%2Fb/ai', '/tickets/id/ai/extra']) assert.equal(parseRoute(path).kind, 'not-found');
});

test('Tickets page rows navigate to a dedicated conversation; queue tabs have bookmarkable URLs', () => {
  const markup = render(TicketQueue, { queue: 'assigned_to_me', tickets: [ticket], loading: false, error: '', onRefresh() {} });
  assert.match(markup, /href="\/tickets\/ticket-1\/conversation"/);
  assert.match(markup, /href="\/tickets\?queue=unassigned"/);
  assert.match(markup, /Account access/);
  assert.doesNotMatch(markup, /reply-form|ai-panel|internal-panel|Ticket details/);
  assert.equal(ticketPath('id', 'notes'), '/tickets/id/notes');
  assert.equal(queuePath('assigned_to_me'), '/tickets');
});

test('shared header exposes section links, compact ticket metadata and current section', () => {
  const markup = render(TicketHeader, { ticket, userId: 'agent', section: 'ai' });
  for (const section of ['overview', 'conversation', 'notes', 'ai']) assert.ok(markup.includes(`/tickets/ticket-1/${section}`));
  assert.match(markup, /<a(?=[^>]*href="\/tickets\/ticket-1\/ai")(?=[^>]*aria-current="page")[^>]*>/);
  assert.match(markup, /Assigned to you/);
  assert.doesNotMatch(markup, /<select|<textarea/);
});

test('Overview contains ticket details and claim without duplicating header update controls', () => {
  const markup = render(TicketOverview, { api: {}, ticket: { ...ticket, assigned_agent_id: null }, userId: 'agent', onClaim() {}, claiming: false, claimError: '', onUpdated() {}, onRefresh() {} });
  assert.match(markup, /customer-1/); assert.match(markup, /category-1/); assert.match(markup, /Claim ticket/);
  assert.doesNotMatch(markup, /aria-label="Ticket status"|aria-label="Ticket priority"/);
  assert.doesNotMatch(markup, /reply-form|ai-panel|internal-panel|Generate AI/);
});

test('section boundary mounts only the active task on a first visit', () => {
  assert.equal(render(RetainedSection, { name: 'ai', active: false, children: createElement('p', null, 'AI draft') }), '');
  const markup = render(RetainedSection, { name: 'ai', active: true, children: createElement('p', null, 'AI draft') });
  assert.match(markup, /data-section="ai"/); assert.match(markup, /AI draft/); assert.doesNotMatch(markup, /hidden/);
});

test('shell separates navigation from one main task, with account/logout at the bottom', () => {
  const markup = render(AppShell, { user: { name: 'Agent' }, loggingOut: false, onLogout() {}, notice: '', children: createElement('p', null, 'One task') });
  assert.match(markup, /aria-label="Main navigation"/); assert.match(markup, /Sign out/);
  assert.match(markup, /<main[^>]*>.*One task.*<\/main>/);
  assert.ok(markup.indexOf('Main navigation') < markup.indexOf('class="account"'));
});

test('browser history switches sections and supports back/forward without page reload', () => {
  const originalWindow = globalThis.window;
  const originalPopState = globalThis.PopStateEvent;
  const target = new EventTarget();
  const history = ['/tickets']; let index = 0;
  function location() { return new URL(history[index], 'http://app.local'); }
  globalThis.PopStateEvent = Event;
  globalThis.window = {
    get location() { return location(); },
    addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target),
    history: {
      pushState(_state, _title, path) { history.splice(++index); history[index] = path; },
      replaceState(_state, _title, path) { history[index] = path; },
      back() { index--; target.dispatchEvent(new Event('popstate')); },
      forward() { index++; target.dispatchEvent(new Event('popstate')); },
    },
  };
  try {
    const locations = [];
    const unsubscribe = subscribeLocation(() => locations.push(getLocation()));
    const link = RouteLink({ href: '/tickets/ticket-1/ai', children: 'AI' });
    let prevented = false;
    link.props.onClick({ button: 0, preventDefault() { prevented = true; } });
    assert.ok(prevented); assert.equal(getLocation(), '/tickets/ticket-1/ai');
    navigate('/tickets/ticket-1/notes'); window.history.back();
    assert.equal(getLocation(), '/tickets/ticket-1/ai');
    window.history.forward(); assert.equal(getLocation(), '/tickets/ticket-1/notes');
    navigate('/tickets/ticket-1/notes'); assert.equal(locations.length, 4);
    unsubscribe(); navigate('/tickets'); assert.equal(locations.length, 4);
    prevented = false;
    link.props.onClick({ button: 0, ctrlKey: true, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
  } finally { globalThis.window = originalWindow; globalThis.PopStateEvent = originalPopState; }
});
