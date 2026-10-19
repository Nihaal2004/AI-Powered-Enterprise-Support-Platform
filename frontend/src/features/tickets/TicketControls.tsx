import { useState } from 'react';
import type { TicketApi } from '../../api/tickets';
import type { Ticket, TicketPriority, TicketStatus } from '../../api/types';
import { errorMessage } from '../../api/client';
import { label } from './format';
import { isTicketLocked, transitions } from './controls';

const priorities: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export function TicketControls({ api, ticket, userId, onUpdated, onRefresh }: {
  api: TicketApi; ticket: Ticket; userId: string; onUpdated: (ticket: Ticket) => void; onRefresh: () => void;
}) {
  return <TicketControlsForm key={`${ticket.id}:${ticket.status}:${ticket.priority}:${ticket.assigned_agent_id}`} api={api} ticket={ticket} userId={userId} onUpdated={onUpdated} onRefresh={onRefresh} />;
}

function TicketControlsForm({ api, ticket, userId, onUpdated, onRefresh }: {
  api: TicketApi; ticket: Ticket; userId: string; onUpdated: (ticket: Ticket) => void; onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const assigned = ticket.assigned_agent_id === userId;
  const locked = isTicketLocked(ticket.status);
  async function update(kind: 'status' | 'priority', value: string) {
    if (busy || (kind === 'status' ? !assigned || !(transitions[ticket.status as TicketStatus] ?? []).includes(value as TicketStatus) : locked || value === ticket.priority)) return;
    setBusy(true); setError('');
    try { onUpdated(kind === 'status' ? await api.status(ticket.id, value as TicketStatus) : await api.priority(ticket.id, value as TicketPriority)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); onRefresh(); }
  }
  return <section className="ticket-controls"><h3>Update ticket</h3>
    {locked && <p className="notice">{ticket.status === 'RESOLVED' ? 'Resolved tickets are locked for replies, message edits and priority changes. Reopen to resume work, or close permanently.' : 'This ticket is permanently closed. Replies and ticket changes are disabled.'}</p>}
    <label>Status<select aria-label="Ticket status" value={status} disabled={busy || !assigned || ticket.status === 'CLOSED'} onChange={event => { setStatus(event.target.value); setError(''); }}>
      <option value={ticket.status}>{label(ticket.status)}</option>{(transitions[ticket.status as TicketStatus] ?? []).map(status => <option key={status} value={status}>{ticket.status === 'RESOLVED' && status === 'IN_PROGRESS' ? 'Reopen ticket' : label(status)}</option>)}
    </select></label>
    {status !== ticket.status && <div className="ticket-change-confirmation">
      <p>{status === 'RESOLVED' ? 'Resolve this ticket? Replies, message edits and priority changes will be blocked until it is reopened.' : status === 'CLOSED' ? 'Close this ticket permanently? It cannot be reopened.' : ticket.status === 'RESOLVED' ? 'Reopen this ticket and allow replies and updates again?' : `Change status to ${label(status)}?`}</p>
      <button className="primary" disabled={busy} onClick={() => void update('status', status)}>{status === 'RESOLVED' ? 'Confirm resolve' : status === 'CLOSED' ? 'Confirm close' : ticket.status === 'RESOLVED' ? 'Reopen ticket' : 'Apply status'}</button>
      <button disabled={busy} onClick={() => setStatus(ticket.status)}>Cancel</button>
    </div>}
    <label>Priority<select aria-label="Ticket priority" value={priority} disabled={busy || locked} onChange={event => { setPriority(event.target.value); setError(''); }}>
      {priorities.map((priority, index) => <option key={priority} value={priority} disabled={!assigned && index < priorities.indexOf(ticket.priority as TicketPriority)}>{label(priority)}</option>)}
    </select></label>
    {priority !== ticket.priority && !locked && <div className="ticket-change-confirmation"><button disabled={busy} onClick={() => void update('priority', priority)}>Apply priority</button><button disabled={busy} onClick={() => setPriority(ticket.priority)}>Cancel</button></div>}
    {!assigned && <small className="muted">Only the assigned agent can change status or lower priority.</small>}
    {busy && <p role="status">Updating ticket…</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>;
}
