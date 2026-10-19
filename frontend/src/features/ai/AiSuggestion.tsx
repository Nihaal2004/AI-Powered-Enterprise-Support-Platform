import { useState } from 'react';
import type { AiState } from './AiSuggestionController';
import { STALE_MESSAGE } from './AiSuggestionController';
import type { AiSuggestionResponse, FeedbackRequest } from './types';
import { CitationList } from './CitationList';

export function AiSuggestion({ suggestion, feedback, submitting, conflict, canAct, onFeedback }: {
  suggestion: AiSuggestionResponse;
  feedback: AiState['feedback'];
  submitting: AiState['submitting'];
  conflict: boolean;
  canAct: boolean;
  onFeedback: (request: FeedbackRequest) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(suggestion.draft_text ?? '');
  if (suggestion.status === 'PENDING') return <p className="ai-status ai-status-pending" role="status">AI suggestion queued</p>;
  if (suggestion.status === 'PROCESSING') return <p className="ai-status ai-status-processing" role="status">Generating grounded response...</p>;
  // failure_reason is deliberately not rendered: the worker stores raw provider exceptions.
  if (suggestion.status === 'FAILED') return <p className="error ai-status-failed" role="alert">The AI suggestion could not be generated. Try generating a fresh suggestion.</p>;
  if (suggestion.status === 'STALE') return <p className="notice ai-status-stale" role="status">{STALE_MESSAGE}</p>;
  if (feedback) {
    const rejected = feedback.feedback_type === 'REJECTED';
    const edited = feedback.feedback_type === 'EDITED';
    return <div className="ai-suggestion">
      <p className={`ai-feedback ai-feedback-${feedback.feedback_type.toLowerCase()} ${rejected ? 'notice' : 'success'}`} role="status">{rejected ? 'Rejected. No reply was sent.' : edited ? 'Edited & sent' : 'Accepted & sent'}</p>
      {rejected ? <>
        <p className="eyebrow">ORIGINAL AI DRAFT · REFERENCE ONLY</p>
        <div className="ai-draft">{suggestion.draft_text || 'No draft was returned.'}</div>
      </> : <>
        <p className="eyebrow">FINAL RESPONSE</p>
        <div className="ai-draft ai-final-text">{feedback.final_text ?? 'The sent text was not returned.'}</div>
        <p className="muted ai-citation-note">Sent to customer without citation markers.</p>
      </>}
      {edited && <details className="ai-original-draft">
        <summary>Original AI draft</summary>
        <div className="ai-draft">{suggestion.draft_text || 'No draft was returned.'}</div>
      </details>}
      <CitationList citations={suggestion.citations} />
    </div>;
  }
  const disabled = !canAct || !!submitting || conflict;
  const hasDraft = !!suggestion.draft_text?.trim();
  return <div className="ai-suggestion">
    <div className="ai-draft-heading"><p className="eyebrow">SUGGESTED REPLY · REVIEW BEFORE SENDING</p><span className="badge ai-ready">Ready</span></div>
    <div className="ai-draft">{suggestion.draft_text || 'No draft was returned.'}</div>
    <CitationList citations={suggestion.citations} />
    <p className="muted ai-citation-note">Citations are for agent reference only and are automatically removed from customer-facing replies.</p>
    <>
      {editing && <form className="ai-edit-form" onSubmit={event => { event.preventDefault(); if (!disabled && text.trim()) void onFeedback({ feedback_type: 'EDITED', final_text: text }); }}>
        <label htmlFor={`ai-edit-${suggestion.id}`}>Edit suggested reply</label>
        <textarea id={`ai-edit-${suggestion.id}`} rows={7} required value={text} disabled={disabled} onChange={event => setText(event.target.value)} />
        <small className="muted">Citation markers are removed by the server from the customer reply.</small>
        <div className="ai-actions"><button className="primary" disabled={disabled || !text.trim()}>{submitting === 'EDITED' ? 'Sending…' : 'Send edited reply'}</button>
          <button type="button" disabled={!!submitting} onClick={() => setEditing(false)}>Cancel edit</button></div>
      </form>}
      {!editing && <div className="ai-actions">
        <button className="confirm" disabled={disabled || !hasDraft} onClick={() => { void onFeedback({ feedback_type: 'ACCEPTED' }); }}>{submitting === 'ACCEPTED' ? 'Sending…' : 'Accept'}</button>
        <button disabled={disabled || !hasDraft} onClick={() => { setText(suggestion.draft_text ?? ''); setEditing(true); }}>Edit &amp; Send</button>
        <button className="negative" disabled={disabled} onClick={() => { void onFeedback({ feedback_type: 'REJECTED' }); }}>{submitting === 'REJECTED' ? 'Rejecting…' : 'Reject'}</button>
      </div>}
    </>
  </div>;
}
