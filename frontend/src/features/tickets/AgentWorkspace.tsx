import { useEffect, useSyncExternalStore } from 'react';
import type { ApiClient } from '../../api/client';
import type { User } from '../../api/types';
import { getLocation, navigate, parseRoute, subscribeLocation, ticketPath } from '../../navigation/routes';
import { RouteLink } from '../../navigation/RouteLink';
import { TicketsPage } from './TicketsPage';
import { TicketPage } from './TicketPage';

export function AgentWorkspace({ client, user }: { client: ApiClient; user: User }) {
  const location = useSyncExternalStore(subscribeLocation, getLocation, () => '/tickets');
  const route = parseRoute(location);
  const queue = new URLSearchParams(location.split('?')[1]).get('queue') === 'unassigned' ? 'unassigned' : 'assigned_to_me';
  const canonical = route.kind === 'tickets' && location === '/' ? '/tickets'
    : route.kind === 'ticket' && location.split('?')[0].replace(/\/$/, '') === `/tickets/${encodeURIComponent(route.ticketId)}` ? ticketPath(route.ticketId, 'conversation', queue) : null;
  useEffect(() => {
    if (canonical) navigate(canonical, true);
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.scrollTo(0, 0);
  }, [location, canonical]);
  if (route.kind === 'tickets') return <TicketsPage key={route.queue} client={client} queue={route.queue} />;
  if (route.kind === 'ticket') return <TicketPage key={route.ticketId} id={route.ticketId} section={route.section} queue={queue} client={client} user={user} />;
  return <section className="page-empty"><h1>Page not found</h1><RouteLink href="/tickets">Back to tickets</RouteLink></section>;
}
