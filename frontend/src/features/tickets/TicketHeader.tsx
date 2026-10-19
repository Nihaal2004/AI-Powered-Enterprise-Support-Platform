import type { Queue, Ticket } from '../../api/types';
import { RouteLink } from '../../navigation/RouteLink';
import { queuePath, ticketPath, ticketSections } from '../../navigation/routes';
import type { TicketSection } from '../../navigation/routes';
import { label } from './format';
import { Icon } from '../../components/Icon';
import type { ReactNode } from 'react';

export function TicketHeader({ ticket, userId, section, queue, compact = false, actions }: { ticket: Ticket; userId: string; section: TicketSection; queue?: Queue; compact?: boolean; actions?: ReactNode }) {
  const assignment = ticket.assigned_agent_id === userId ? 'Assigned to you' : ticket.assigned_agent_id ? 'Assigned to another agent' : 'Unassigned';
  return <>{compact ? <header className="ticket-heading ticket-heading-compact">
    <RouteLink className="back-link" href={queuePath(queue ?? 'assigned_to_me')}>← Tickets</RouteLink>
    <div className="ticket-compact-title"><p className="eyebrow">#{ticket.id.slice(0, 8)}</p><h1 id="page-heading" tabIndex={-1} title={ticket.title}>{ticket.title}</h1></div>
    <div className="ticket-summary"><span className={`badge status-${ticket.status.toLowerCase()}`}>{label(ticket.status)}</span><span className={`badge priority-${ticket.priority.toLowerCase()}`}>{label(ticket.priority)} priority</span><span className="assignment-label">{assignment}</span></div>
  </header> : <header className="ticket-heading"><div className="ticket-heading-top"><p className="eyebrow">TICKET #{ticket.id.slice(0, 8)}</p>
    <span className="assignment-label">{ticket.assigned_agent_id === userId ? 'Assigned to you' : ticket.assigned_agent_id ? 'Assigned to another agent' : 'Unassigned'}</span></div>
    <div className="ticket-heading-main"><h1 id="page-heading" tabIndex={-1}>{ticket.title}</h1>
    <div className="ticket-summary"><span className={`badge status-${ticket.status.toLowerCase()}`}>{label(ticket.status)}</span><span className={`badge priority-${ticket.priority.toLowerCase()}`}>{label(ticket.priority)} priority</span></div></div>
  </header>}<div className="ticket-navigation-row"><nav className="ticket-section-nav" aria-label="Ticket sections">{ticketSections.map(item => <RouteLink key={item.id} href={ticketPath(ticket.id, item.id, queue)} aria-current={section === item.id ? 'page' : undefined}><Icon name={item.id} /><span>{item.label}</span></RouteLink>)}</nav>{actions}</div></>;
}
