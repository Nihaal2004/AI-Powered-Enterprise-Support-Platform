import { useEffect, useState } from 'react';
import type { TicketApi } from '../../api/tickets';
import type { InternalNote } from '../../api/types';
import { errorMessage } from '../../api/client';
import { InternalNoteItem } from './InternalNoteItem';

export function InternalNotes({ api, ticketId, userId }: { api: TicketApi; ticketId: string; userId?: string }) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.notes(ticketId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setNotes(value); setError(''); setLoaded(true); }
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, ticketId, retry]);
  return <section className="internal-panel" aria-label="Internal notes"><header className="section-heading"><div className="section-title"><h2>Internal notes</h2><span className="internal-label">INTERNAL</span></div>
    <p className="muted">Visible to support staff only. Never sent to the customer.</p>
    </header>
    {loading ? <p role="status" className="section-loading">Loading notes…</p> : loaded && <div className="internal-list">{notes.length === 0 && <p className="notes-empty">No internal notes yet.</p>}
      {notes.map(note => <InternalNoteItem key={note.id} note={note} userId={userId} />)}</div>}
    {error && <p role="alert" className="error">{error} <button disabled={loading || busy} onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1); }}>Reload notes</button></p>}
    <form onSubmit={async event => {
      event.preventDefault(); if (!draft.trim() || busy || loading || !loaded) return;
      setBusy(true); setSaveError('');
      try { const note = await api.addNote(ticketId, draft.trim()); setNotes(previous => [...previous, note]); setDraft(''); }
      catch (err) { setSaveError(errorMessage(err)); } finally { setBusy(false); }
    }}><label htmlFor="internal-note">Add internal note</label><textarea id="internal-note" rows={4} required maxLength={10000} disabled={busy || !loaded} placeholder="Add context for your team…" value={draft} onChange={event => setDraft(event.target.value)} />
      {saveError && <p className="error" role="alert">{saveError}</p>}
      <div className="note-compose-footer"><small className="muted">Internal only</small><button className="primary" disabled={loading || busy || !loaded || !draft.trim()}>{busy ? 'Saving…' : 'Save internal note'}</button></div></form>
  </section>;
}
