import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TicketSection } from '../../navigation/routes';

// Mount on first visit; keep state and effects alive for this ticket thereafter.
// hidden removes inactive sections from layout, keyboard navigation and accessibility.
export function RetainedSection({ name, active, children }: { name: TicketSection; active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  if (!active && !visited) return null;
  return <div className={`ticket-section section-${name}`} data-section={name} hidden={!active}>{children}</div>;
}
