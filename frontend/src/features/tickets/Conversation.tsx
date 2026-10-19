import { useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Message, Ticket } from '../../api/types';
import { errorMessage } from '../../api/client';
import type { TicketApi } from '../../api/tickets';
import { Attachments } from './Attachments';
import { uploadAttachment, validateFile } from './uploadAttachment';
import { MessageActions } from './MessageActions';
import { createConversationScroll } from './conversationScroll';
import type { Queue } from '../../api/types';
import { RouteLink } from '../../navigation/RouteLink';
import { ticketPath } from '../../navigation/routes';
import { Icon } from '../../components/Icon';
import { isTicketLocked } from './controls';
const formatTime = (value: string) => new Date(value).toLocaleString();
export function Conversation({ api, userId, revision, onChanged, ticket, messages, canReply: replyAllowed, onReply, active = true, queue }: {
  api: TicketApi; userId: string; revision: number; onChanged: () => void;
  ticket: Ticket; messages: Message[]; canReply: boolean; onReply: (body: string) => Promise<Message>;
  active?: boolean; queue?: Queue;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [savedMessage, setSavedMessage] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const locked = isTicketLocked(ticket.status);
  const canReply = replyAllowed && !locked;
  const fileInput = useRef<HTMLInputElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const messageContent = useRef<HTMLDivElement>(null);
  const scrolling = useRef<ReturnType<typeof createConversationScroll> | null>(null);
  useLayoutEffect(() => {
    const viewport = messageList.current;
    const content = messageContent.current;
    if (!viewport || !content) return;
    const controller = createConversationScroll(viewport);
    scrolling.current = controller;
    viewport.addEventListener('scroll', controller.onScroll, { passive: true });
    const observer = new ResizeObserver(controller.sync);
    observer.observe(viewport); observer.observe(content);
    controller.sync();
    return () => { observer.disconnect(); viewport.removeEventListener('scroll', controller.onScroll); scrolling.current = null; };
  }, []);
  useLayoutEffect(() => { if (active) scrolling.current?.sync(); }, [active, messages.length]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!canReply || !draft.trim() || sending) return;
    setSending(true); setError(''); setSent(false);
    try {
      if (file) validateFile(file);
      const message = savedMessage ?? await onReply(draft.trim());
      scrolling.current?.latest();
      setSavedMessage(message);
      if (file) { setUploading(true); await uploadAttachment(api, ticket.id, message.id, file); }
      setDraft(''); setFile(null); setSavedMessage(null); setSent(true);
      if (fileInput.current) fileInput.current.value = '';
      onChanged();
    }
    catch (err) { setError(errorMessage(err)); }
    finally { setSending(false); setUploading(false); }
  }
  return <section className="conversation-panel" aria-label="Customer conversation">
    <div className="messages" ref={messageList} aria-label="Conversation" tabIndex={0}><div className="messages-content" ref={messageContent}>{messages.length === 0 && <p className="empty">No messages yet.</p>}
      {messages.map(message => <div key={message.id} className={`message-row ${message.message_type === 'AGENT_REPLY' ? 'agent-row' : 'customer-row'}`}><span className="message-avatar" aria-hidden="true">{message.message_type === 'AGENT_REPLY' ? 'A' : 'C'}</span><article className={`message ${message.message_type === 'AGENT_REPLY' ? 'agent-message' : 'customer-message'}`}>
        <header><strong>{message.message_type === 'AGENT_REPLY' ? message.author_user_id === userId ? 'You' : 'Support agent' : 'Customer'}</strong><time dateTime={message.created_at}>{formatTime(message.created_at)}</time></header>
        <p className={message.deleted_at ? 'deleted' : ''}>{message.body}</p>
        {message.edited_at && !message.deleted_at && <small className="muted">Edited {formatTime(message.edited_at)}</small>}
        {!message.deleted_at && <Attachments api={api} ticketId={ticket.id} messageId={message.id} revision={revision} />}
        {!locked && <MessageActions api={api} message={message} userId={userId} onChanged={onChanged} />}
      </article></div>)}
    </div></div>
    <form className="reply-form" onSubmit={submit}><div className="composer-heading"><label htmlFor="reply">Reply to customer</label><small>Customer-visible</small></div>
      {!canReply && <p className="notice">{locked ? ticket.status === 'RESOLVED' ? 'This ticket is resolved. Reopen it using Update ticket before replying.' : 'This ticket is closed. The conversation is read-only.' : ticket.assigned_agent_id ? 'Only the assigned agent can reply.' : <>Claim this ticket in <RouteLink href={ticketPath(ticket.id, 'overview', queue)}>Overview</RouteLink> to send a reply.</>}</p>}
      <textarea id="reply" rows={2} maxLength={10000} required disabled={!canReply || sending || !!savedMessage} value={draft} onChange={e => { setDraft(e.target.value); setSent(false); }} placeholder="Write your response…" />
      {savedMessage && !sending && <p className="notice">Reply already sent. Retry the attachment without sending another reply. <button type="button" onClick={() => {
        setSavedMessage(null); setFile(null); setDraft(''); setError(''); if (fileInput.current) fileInput.current.value = '';
      }}>Finish without attachment</button></p>}
      {uploading && <p role="status">Uploading file directly to storage and confirming…</p>}
      {error && <p role="alert" className="error">{error}</p>}{sent && <p role="status" className="success">Reply sent.</p>}
      <div className="reply-footer"><div className="attachment-control"><label className={`attachment-picker${!canReply || sending ? ' is-disabled' : ''}`}><Icon name="attachment" />Attach file<input ref={fileInput} type="file" aria-label="Attach file (up to 10 MB)" disabled={!canReply || sending} onChange={event => {
        setError(''); const next = event.target.files?.[0] ?? null;
        try { if (next) validateFile(next); setFile(next); }
        catch (err) { setFile(null); event.target.value = ''; setError(errorMessage(err)); }
      }} /></label><span className="selected-file">{file ? file.name : 'Up to 10 MB'}</span></div>
      <small className="muted">{draft.length.toLocaleString()}/10,000</small><button className="primary" disabled={!canReply || sending || !draft.trim()}>{sending ? 'Sending…' : savedMessage ? 'Retry attachment' : 'Send reply'}</button></div>
    </form>
  </section>;
}
