import { useEffect, useMemo, useState } from 'react';
import type { ApiClient } from '../../api/client';
import { errorMessage } from '../../api/client';
import { ticketApi } from '../../api/tickets';
import type { Queue, Ticket } from '../../api/types';
import { TicketQueue } from './TicketQueue';

export function TicketsPage({ client, queue }: { client: ApiClient; queue: Queue }) {
  const api = useMemo(() => ticketApi(client), [client]);
  const [revision, setRevision] = useState(0);
  const [list, setList] = useState<{ tickets: Ticket[]; loading: boolean; error: string }>({ tickets: [], loading: true, error: '' });
  useEffect(() => { document.title = 'Tickets · Enterprise Support'; }, []);
  useEffect(() => {
    const controller = new AbortController();
    api.queue(queue, controller.signal).then(tickets => {
      if (!controller.signal.aborted) setList({ tickets, loading: false, error: '' });
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setList({ tickets: [], loading: false, error: errorMessage(err) });
    });
    return () => controller.abort();
  }, [api, queue, revision]);
  return <div className="tickets-page"><header className="page-heading"><p className="eyebrow">SUPPORT WORKSPACE</p><h1 id="page-heading" tabIndex={-1}>Tickets</h1><p className="muted">Choose a ticket to start working.</p></header>
    <TicketQueue key={queue} queue={queue} tickets={list.tickets} loading={list.loading} error={list.error}
      onRefresh={() => { setList(previous => ({ ...previous, loading: true, error: '' })); setRevision(value => value + 1); }} />
  </div>;
}
