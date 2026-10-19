import { useEffect, useState } from 'react';
import type { Message } from '../../api/types';
import type { TicketApi } from '../../api/tickets';
import { errorMessage } from '../../api/client';
import { canModify } from './controls';

export function MessageActions({ api, message, userId, onChanged }: { api: TicketApi; message: Message; userId: string; onChanged: () => void }) {
  const [now, setNow] = useState(Date.now);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const eligible = canModify(message, userId, now);
  async function mutate(remove: boolean) {
    setBusy(true); setError('');
    try {
      if (remove) await api.delete(message.ticket_id, message.id);
      else await api.edit(message.ticket_id, message.id, body.trim());
      setEditing(false); setConfirming(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); onChanged(); }
  }
  return <div className="message-actions">
    {eligible && !editing && !confirming && <><button type="button" onClick={() => { setBody(message.body); setEditing(true); }}>Edit</button><button type="button" onClick={() => setConfirming(true)}>Delete</button></>}
    {editing && <form onSubmit={event => { event.preventDefault(); void mutate(false); }}><label htmlFor={`edit-${message.id}`}>Edit customer-visible reply</label><textarea id={`edit-${message.id}`} required maxLength={10000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} />
      {!eligible && <p className="muted">The 15-minute editing window has expired.</p>}
      <button disabled={busy || !eligible || !body.trim()}>Save edit</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></form>}
    {confirming && <div role="group" aria-label="Confirm message deletion"><p>Delete this reply? The conversation will show a deleted-message placeholder.</p><button className="negative" disabled={busy || !eligible} onClick={() => void mutate(true)}>Confirm delete</button><button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>}
    {busy && <small role="status">Saving…</small>}{error && <p className="error" role="alert">{error}</p>}
  </div>;
}
