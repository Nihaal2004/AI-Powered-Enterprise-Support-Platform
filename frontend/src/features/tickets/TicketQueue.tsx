import { useEffect, useState } from 'react';
import type { Queue, Ticket } from '../../api/types';
import { QueueToolbar } from './QueueToolbar';
import { defaultFilters, filterTickets, readFilters, sortLabels } from './queueFilters';
import { label } from './format';
import { RouteLink } from '../../navigation/RouteLink';
import { queuePath, ticketPath } from '../../navigation/routes';
import { Icon } from '../../components/Icon';
export function TicketQueue({ queue, tickets, loading, error, onRefresh }: {
  queue: Queue; tickets: Ticket[]; loading: boolean; error: string; onRefresh: () => void;
}) {
  const storageKey = `support-queue-view:${queue}`;
  const [filters, setFilters] = useState(() => readFilters(storageKey));
  const [page, setPage] = useState(1);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(filters)); } catch { /* Storage is optional. */ }
  }, [filters, storageKey]);
  const filtered = filterTickets(tickets, filters);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const reset = () => { setFilters({ ...defaultFilters }); setPage(1); };
  return <section className="queue-panel" aria-label="Ticket queues"><div className="panel-heading">
    <nav className="queue-tabs" aria-label="Ticket queues">
      <RouteLink href={queuePath('assigned_to_me')} aria-current={queue === 'assigned_to_me' ? 'page' : undefined}>Assigned to Me</RouteLink>
      <RouteLink href={queuePath('unassigned')} aria-current={queue === 'unassigned' ? 'page' : undefined}>Unassigned</RouteLink>
    </nav><button onClick={onRefresh} disabled={loading}>Refresh</button></div>
    <QueueToolbar filters={filters} onChange={value => { setFilters(value); setPage(1); }} onReset={reset} />
    <p className="queue-caption" role="status">{loading ? 'Loading tickets…' : error ? 'Could not load tickets' : `${filtered.length} of ${tickets.length} tickets`} · {sortLabels[filters.sort]} · Current queue</p>
    {error && <p role="alert" className="error">{error} <button onClick={onRefresh}>Retry</button></p>}
    {!loading && !error && tickets.length === 0 && <div className="empty">No tickets in this queue.</div>}
    {!loading && !error && tickets.length > 0 && filtered.length === 0 && <div className="empty">No tickets match your search and filters. <button onClick={reset}>Clear filters</button></div>}
    {filtered.length > 0 && <div className="queue-column-headings" aria-hidden="true"><span>Ticket / last activity</span><span>Status</span><span>Priority</span><span>Assignment</span><span /></div>}
    <div className="ticket-list" aria-busy={loading}>{visible.map(ticket => <RouteLink key={ticket.id} className="ticket-row" href={ticketPath(ticket.id, 'conversation', queue)}>
      <span className="ticket-row-identity"><span className="ticket-row-icon" aria-hidden="true"><Icon name="conversation" /></span><span className="ticket-row-text"><span className="ticket-ref">#{ticket.id.slice(0, 8)}{ticket.customer_urgency === 'URGENT' && <span className="badge urgent">Urgent</span>}</span><strong>{ticket.title}</strong>{ticket.last_message_at && <time className="queue-ticket-time" dateTime={ticket.last_message_at}>{new Date(ticket.last_message_at).toLocaleString()}</time>}</span></span>
      <span className="ticket-cell"><span className={`badge status-${ticket.status.toLowerCase()}`}>{label(ticket.status)}</span></span>
      <span className="ticket-cell"><span className={`badge priority-${ticket.priority.toLowerCase()}`}>{label(ticket.priority)}</span></span>
      <span className={`assignment-label ticket-assignment ${ticket.assigned_agent_id ? 'is-assigned' : ''}`}>{ticket.assigned_agent_id ? 'Assigned to you' : 'Unassigned'}</span><span className="ticket-row-arrow"><Icon name="chevron" /></span>
    </RouteLink>)}</div>
    {!loading && !error && filtered.length > pageSize && <nav className="queue-pagination" aria-label="Ticket pages">
      <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span>
      <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
    </nav>}
  </section>;
}
