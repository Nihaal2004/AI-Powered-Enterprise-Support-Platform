import type { ApiClient } from '../../api/client';
import type { Ticket } from '../../api/types';
import type { FeedbackRequest } from './types';
import { AiSuggestion } from './AiSuggestion';
import { useAiSuggestion } from './useAiSuggestion';
import { isPending } from './AiSuggestionController';
import type { AiState } from './AiSuggestionController';
import './ai.css';

export function GenerateSuggestionButton({ state, canGenerate, onGenerate }: {
  state: Pick<AiState, 'suggestion' | 'generating' | 'submitting'>;
  canGenerate: boolean;
  onGenerate: () => Promise<void>;
}) {
  return <button className="primary ai-generate" disabled={!canGenerate || state.generating || isPending(state.suggestion) || !!state.submitting} onClick={() => { void onGenerate(); }}>
    {state.generating ? 'Requesting suggestion…' : state.suggestion?.status === 'STALE' ? 'Generate New Suggestion' : 'Generate AI Suggestion'}
  </button>;
}

export function AiAssistantPanel({ client, ticket, userId, onReplyCreated }: {
  client: ApiClient; ticket: Ticket; userId: string; onReplyCreated: () => void;
}) {
  const ai = useAiSuggestion(client, ticket.id);
  const assigned = ticket.assigned_agent_id === userId;
  const canGenerate = assigned && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED';
  async function submit(payload: FeedbackRequest) {
    if (!canGenerate) return;
    const feedback = await ai.submit(payload);
    // Feedback already created the reply atomically. Only reload; never POST a message here.
    if (feedback && feedback.feedback_type !== 'REJECTED') onReplyCreated();
  }
  return <section className="ai-panel" aria-labelledby="ai-heading">
    <header className="ai-section-heading"><div>
    <div className="ai-panel-heading"><span className="ai-monogram" aria-hidden="true">AI</span><h2 id="ai-heading">AI Assistant</h2></div>
    <p className="muted ai-intro">Draft a response grounded in the knowledge base.</p>
    </div><GenerateSuggestionButton state={ai} canGenerate={canGenerate} onGenerate={ai.generate} /></header>
    {!canGenerate && <p className="notice">{assigned ? 'AI suggestions are unavailable for resolved or closed tickets.' : 'Claim this ticket to generate AI suggestions.'}</p>}
    {ai.error && <p className="error" role="alert">{ai.error}</p>}
    {ai.suggestion && <AiSuggestion key={ai.suggestion.id} suggestion={ai.suggestion} feedback={ai.feedback} submitting={ai.submitting} conflict={ai.conflict} canAct={canGenerate} onFeedback={submit} />}
    {ai.suggestion && !ai.polling && !ai.error && ['PENDING', 'PROCESSING'].includes(ai.suggestion.status) && <p className="notice">Status checks stopped. Generate a fresh suggestion to continue.</p>}
  </section>;
}
