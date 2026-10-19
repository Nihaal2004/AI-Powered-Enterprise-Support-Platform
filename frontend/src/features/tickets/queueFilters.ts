import type { Ticket } from '../../api/types';

export const defaultFilters = {
  search: '', status: 'ALL', priority: 'ALL', urgency: 'ALL',
  dateField: 'created_at', period: 'ALL', from: '', to: '', sort: 'activity',
};
export type QueueFilters = typeof defaultFilters;
export const sortLabels: Record<string, string> = {
  activity: 'Latest activity', newest: 'Newest created', oldest: 'Oldest created', priority: 'Highest priority',
};
const ranks: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const timestamp = (value?: string) => value ? Date.parse(value) : NaN;

export function invalidDateRange(filters: QueueFilters) {
  return filters.period === 'CUSTOM' && !!filters.from && !!filters.to && filters.from > filters.to;
}

export function filterTickets(tickets: Ticket[], filters: QueueFilters, now = Date.now()) {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const start = filters.period === 'CUSTOM'
    ? filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : -Infinity
    : filters.period === 'TODAY' ? new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()
    : filters.period === 'ALL' ? -Infinity : now - Number(filters.period) * 86400000;
  // Use an exclusive local midnight boundary so the entire end date is included, including DST days.
  const endDate = filters.to ? new Date(`${filters.to}T00:00:00`) : null;
  if (endDate) endDate.setDate(endDate.getDate() + 1);
  const end = filters.period === 'CUSTOM' ? endDate?.getTime() ?? Infinity : now + 1;
  if (invalidDateRange(filters)) return [];
  return tickets.filter(ticket => {
    const haystack = `${ticket.title} ${ticket.id} #${ticket.id} ${ticket.customer_id}`.toLowerCase();
    const date = timestamp(ticket[filters.dateField === 'updated_at' ? 'updated_at' : 'created_at']);
    return terms.every(term => haystack.includes(term))
      && (filters.status === 'ALL' || (filters.status === 'ACTIVE' ? !['RESOLVED', 'CLOSED'].includes(ticket.status) : ticket.status === filters.status))
      && (filters.priority === 'ALL' || ticket.priority === filters.priority)
      && (filters.urgency === 'ALL' || ticket.customer_urgency === filters.urgency)
      && (filters.period === 'ALL' || (Number.isFinite(date) && date >= start && date < end));
  }).sort((a, b) => {
    const date = (ticket: Ticket, field: 'created_at' | 'last_message_at') => {
      const value = timestamp(ticket[field]);
      return Number.isFinite(value) ? value : 0;
    };
    const activity = date(b, 'last_message_at') - date(a, 'last_message_at');
    if (filters.sort === 'priority') return (ranks[b.priority] ?? 0) - (ranks[a.priority] ?? 0) || activity;
    if (filters.sort === 'newest') return date(b, 'created_at') - date(a, 'created_at');
    if (filters.sort === 'oldest') return date(a, 'created_at') - date(b, 'created_at');
    return activity;
  });
}

export function readFilters(key: string): QueueFilters {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? '{}');
    const result = { ...defaultFilters };
    for (const name of Object.keys(result) as (keyof QueueFilters)[]) {
      if (typeof saved[name] === 'string') result[name] = saved[name];
    }
    const choices: Partial<Record<keyof QueueFilters, string[]>> = {
      status: ['ALL', 'ACTIVE', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
      priority: ['ALL', ...Object.keys(ranks)], urgency: ['ALL', 'NORMAL', 'URGENT'],
      dateField: ['created_at', 'updated_at'], period: ['ALL', 'TODAY', '7', '30', '90', 'CUSTOM'], sort: Object.keys(sortLabels),
    };
    for (const name of Object.keys(choices) as (keyof QueueFilters)[]) {
      if (!choices[name]!.includes(result[name])) result[name] = defaultFilters[name];
    }
    for (const name of ['from', 'to'] as const) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(result[name])) result[name] = '';
    }
    return result;
  } catch { return { ...defaultFilters }; }
}
