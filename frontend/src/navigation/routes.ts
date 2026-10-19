import type { Queue } from '../api/types';

export const ticketSections = [
  { id: 'overview', label: 'Overview' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'notes', label: 'Internal Notes' },
  { id: 'ai', label: 'AI Assistant' },
] as const;
export type TicketSection = typeof ticketSections[number]['id'];
export type AppRoute = { kind: 'tickets'; queue: Queue }
  | { kind: 'ticket'; ticketId: string; section: TicketSection }
  | { kind: 'not-found' };

export function ticketPath(ticketId: string, section: TicketSection = 'conversation', queue?: Queue) {
  return `/tickets/${encodeURIComponent(ticketId)}/${section}${queue === 'unassigned' ? '?queue=unassigned' : ''}`;
}
export function queuePath(queue: Queue) {
  return queue === 'unassigned' ? '/tickets?queue=unassigned' : '/tickets';
}
export function parseRoute(location: string): AppRoute {
  const url = new URL(location, 'http://app.local');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/tickets') return { kind: 'tickets', queue: url.searchParams.get('queue') === 'unassigned' ? 'unassigned' : 'assigned_to_me' };
  const match = /^\/tickets\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (match) {
    const section = match[2] ?? 'conversation';
    if (ticketSections.some(item => item.id === section)) {
      try {
        const ticketId = decodeURIComponent(match[1]);
        if (ticketId && !/[/?#]/.test(ticketId)) return { kind: 'ticket', ticketId, section: section as TicketSection };
      } catch { /* Malformed URL: show the application not-found screen. */ }
    }
  }
  return { kind: 'not-found' };
}

export const getLocation = () => window.location.pathname + window.location.search;
export function subscribeLocation(listener: () => void) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
export function navigate(path: string, replace = false) {
  if (path === getLocation()) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
