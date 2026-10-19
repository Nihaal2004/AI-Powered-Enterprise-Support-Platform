import type { Ticket } from '../../api/types';
import { TicketDetails } from './TicketDetails';

export function TicketOverview({ ticket, userId, onClaim, claiming, claimError }: {
  ticket: Ticket; userId: string; onClaim: () => void; claiming: boolean; claimError: string;
}) {
  return <div className="ticket-overview"><header className="section-heading"><h2>Overview</h2><p className="muted">Ticket information and management.</p></header>
    {claimError && <p role="alert" className="error">{claimError}</p>}
    <TicketDetails ticket={ticket} userId={userId} onClaim={onClaim} busy={claiming} />
  </div>;
}
