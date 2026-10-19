import type { Ticket } from '../../api/types';
import { label } from './format';
import { isTicketLocked } from './controls';
export function TicketDetails({ ticket, userId, onClaim, busy }: { ticket: Ticket; userId: string; onClaim: () => void; busy: boolean }) {
  return <section className="details-panel"><h2>Ticket information</h2><dl>
    <dt>Customer urgency</dt><dd><span className={`badge ${ticket.customer_urgency === 'URGENT' ? 'urgent' : ''}`}>{label(ticket.customer_urgency)}</span></dd>
    <dt>Assignment</dt><dd>{ticket.assigned_agent_id === userId ? 'Assigned to you' : ticket.assigned_agent_id ? 'Assigned to another agent' : 'Unassigned'}</dd>
    <dt>Customer ID</dt><dd className="identifier">{ticket.customer_id}</dd>
    <dt>Category ID</dt><dd className="identifier">{ticket.primary_category_id}</dd>
    <dt>Ticket ID</dt><dd className="identifier">{ticket.id}</dd>
    {ticket.created_at && <><dt>Created</dt><dd><time dateTime={ticket.created_at}>{new Date(ticket.created_at).toLocaleString()}</time></dd></>}
    {ticket.updated_at && <><dt>Last updated</dt><dd><time dateTime={ticket.updated_at}>{new Date(ticket.updated_at).toLocaleString()}</time></dd></>}
    {ticket.resolved_at && <><dt>Resolved</dt><dd><time dateTime={ticket.resolved_at}>{new Date(ticket.resolved_at).toLocaleString()}</time></dd></>}
    {ticket.closed_at && <><dt>Closed</dt><dd><time dateTime={ticket.closed_at}>{new Date(ticket.closed_at).toLocaleString()}</time></dd></>}
  </dl>{!ticket.assigned_agent_id && !isTicketLocked(ticket.status) && <button className="primary" disabled={busy} onClick={onClaim}>{busy ? 'Claiming…' : 'Claim ticket'}</button>}</section>;
}
