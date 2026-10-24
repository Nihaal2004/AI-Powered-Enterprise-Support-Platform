import { useEffect, useMemo, useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import type { ApiClient } from '../../api/client';
import { ticketApi } from '../../api/tickets';
import type { Message, Queue, Ticket, User } from '../../api/types';
import { RouteLink } from '../../navigation/RouteLink';
import type { TicketSection } from '../../navigation/routes';
import { queuePath } from '../../navigation/routes';
import { TicketHeader } from './TicketHeader';
import { TicketOverview } from './TicketOverview';
import { Conversation } from './Conversation';
import { AiAssistantPanel } from '../ai/AiAssistantPanel';
import { InternalNotes } from './InternalNotes';
import { RetainedSection } from './RetainedSection';
import { TicketUpdate } from './TicketUpdate';

export function TicketPage({ id, section, client, user, queue = 'assigned_to_me' }: { id: string; section: TicketSection; client: ApiClient; user: User; queue?: Queue }) {
  const api = useMemo(() => ticketApi(client), [client]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [error, setError] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    api.detail(id, controller.signal).then(value => {
      if (!controller.signal.aborted) { setTicket(value); setError(''); }
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorMessage(err)); });
    api.messages(id, controller.signal).then(value => {
      if (!controller.signal.aborted) { setMessages(value); setMessagesLoaded(true); setMessageError(''); }
    }).catch((err: unknown) => { if (!controller.signal.aborted) setMessageError(errorMessage(err)); });
    return () => controller.abort();
  }, [api, id, revision]);
  useEffect(() => {
    document.title = ticket ? `${ticket.title} · Enterprise Support` : 'Ticket · Enterprise Support';
  }, [ticket]);
  async function claim() {
    setClaiming(true); setClaimError('');
    try {
      const ticket = await api.claim(id);
      setTicket(ticket); refresh();
    } catch (err) {
      setClaimError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) refresh();
    } finally { setClaiming(false); }
  }
  return <div className={`ticket-page${section === 'conversation' ? ' ticket-page-conversation' : ''}`}>
    {section !== 'conversation' && <RouteLink className="back-link" href={queuePath(queue)}>← All tickets</RouteLink>}
    {error && <p role="alert" className="error">{error} <button onClick={refresh}>Retry</button></p>}
    {!ticket ? !error && <p className="page-empty" role="status">Loading ticket…</p> : <>
      <TicketHeader ticket={ticket} userId={user.id} section={section} queue={queue} compact={section === 'conversation'}
        actions={<TicketUpdate api={api} ticket={ticket} userId={user.id} onUpdated={setTicket} onRefresh={refresh} />} />
      <RetainedSection name="overview" active={section === 'overview'}><TicketOverview ticket={ticket} userId={user.id}
        onClaim={claim} claiming={claiming} claimError={claimError}
        /></RetainedSection>
      <RetainedSection name="conversation" active={section === 'conversation'}>
        {messageError && <p role="alert" className="error">{messageError} <button onClick={refresh}>Retry conversation</button></p>}
        {!messagesLoaded && !messageError && <p role="status" className="section-loading">Loading conversation…</p>}
        {messagesLoaded && <Conversation api={api} userId={user.id} onChanged={refresh} active={section === 'conversation'} queue={queue}
        ticket={ticket} messages={messages} canReply={ticket.assigned_agent_id === user.id} onReply={async body => {
          const message = await api.reply(id, body);
          setMessages(previous => [...previous, message]);
          refresh(); return message;
        }} />}</RetainedSection>
      <RetainedSection name="notes" active={section === 'notes'}><InternalNotes api={api} ticketId={id} userId={user.id} /></RetainedSection>
      <RetainedSection name="ai" active={section === 'ai'}><AiAssistantPanel client={client} ticket={ticket} userId={user.id} onReplyCreated={refresh} /></RetainedSection>
    </>}
  </div>;
}
