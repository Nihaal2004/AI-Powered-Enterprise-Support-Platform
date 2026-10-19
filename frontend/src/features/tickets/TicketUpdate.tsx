import { useEffect, useRef } from 'react';
import type { TicketApi } from '../../api/tickets';
import type { Ticket } from '../../api/types';
import { Icon } from '../../components/Icon';
import { TicketControls } from './TicketControls';

export function TicketUpdate(props: { api: TicketApi; ticket: Ticket; userId: string; onUpdated: (ticket: Ticket) => void; onRefresh: () => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false;
    }
    document.addEventListener('click', closeOutside);
    return () => document.removeEventListener('click', closeOutside);
  }, []);
  return <details ref={menu} className="ticket-update" onKeyDown={event => {
    if (event.key === 'Escape' && menu.current?.open) {
      menu.current.open = false; menu.current.querySelector('summary')?.focus(); event.stopPropagation();
    }
  }}><summary>Update ticket<Icon name="chevron" /></summary>
    <div className="ticket-update-popover"><TicketControls {...props} /></div>
  </details>;
}
