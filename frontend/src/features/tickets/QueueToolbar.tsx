import { useId, useState } from 'react';
import { label } from './format';
import { invalidDateRange, sortLabels } from './queueFilters';
import type { QueueFilters } from './queueFilters';

export function QueueToolbar({ filters, onChange, onReset }: {
  filters: QueueFilters; onChange: (filters: QueueFilters) => void; onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const activeCount = [filters.status, filters.priority, filters.urgency, filters.period].filter(value => value !== 'ALL').length;
  const update = (key: keyof QueueFilters, value: string) => onChange({ ...filters, [key]: value });
  return <div className="queue-toolbar">
    <div className="queue-search-row"><label className="queue-search">Search tickets<input type="search" value={filters.search}
      placeholder="Search title, ticket ID or customer ID…" onChange={event => update('search', event.target.value)} /></label>
      <label>Sort by<select value={filters.sort} onChange={event => update('sort', event.target.value)}>
        {Object.entries(sortLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>
      <button type="button" className="queue-filter-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Hide filters' : 'Show filters'}{activeCount > 0 && <span className="queue-filter-count">{activeCount} active</span>}<span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button><button type="button" onClick={onReset}>Reset view</button></div>
    <div id={panelId} className="queue-filter-panel" hidden={!expanded}>
    <div className="queue-filter-row">
      <label>Status<select value={filters.status} onChange={event => update('status', event.target.value)}>
        <option value="ALL">All statuses</option><option value="ACTIVE">Active tickets</option>
        {['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'].map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      <label>Priority<select value={filters.priority} onChange={event => update('priority', event.target.value)}>
        <option value="ALL">All priorities</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(value => <option key={value} value={value}>{label(value)}</option>)}
      </select></label>
      <label>Customer urgency<select value={filters.urgency} onChange={event => update('urgency', event.target.value)}>
        <option value="ALL">All urgency levels</option><option value="NORMAL">Normal</option><option value="URGENT">Urgent</option>
      </select></label>
      <label>Date based on<select value={filters.dateField} onChange={event => update('dateField', event.target.value)}>
        <option value="created_at">Created</option><option value="updated_at">Last updated</option>
      </select></label>
      <label>Time period<select value={filters.period} onChange={event => update('period', event.target.value)}>
        <option value="ALL">Any time</option><option value="TODAY">Today</option><option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="CUSTOM">Custom dates</option>
      </select></label>
      {filters.period === 'CUSTOM' && <><label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={event => update('from', event.target.value)} /></label>
        <label>Through<input type="date" value={filters.to} min={filters.from || undefined} onChange={event => update('to', event.target.value)} /></label></>}
    </div>
    {filters.period !== 'ALL' && <small className="muted">Dates use your local time zone. Tickets without a date are excluded.</small>}
    </div>
    {invalidDateRange(filters) && <p role="alert" className="error">The end date must be on or after the start date.</p>}
  </div>;
}
