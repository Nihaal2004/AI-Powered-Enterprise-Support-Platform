import { ApiError, errorMessage } from '../../api/client';
import type { AiApi } from '../../api/ai';
import type { AiSuggestionResponse, FeedbackRequest, FeedbackResponse } from './types';

export interface AiState {
  suggestion: AiSuggestionResponse | null;
  generating: boolean;
  polling: boolean;
  submitting: FeedbackRequest['feedback_type'] | null;
  feedback: FeedbackResponse | null;
  conflict: boolean;
  error: string;
}

export const STALE_MESSAGE = 'Conversation changed while this suggestion was being generated. Generate a new suggestion.';
const initialState = (): AiState => ({ suggestion: null, generating: false, polling: false, submitting: null, feedback: null, conflict: false, error: '' });
export const isPending = (suggestion: AiSuggestionResponse | null) => suggestion?.status === 'PENDING' || suggestion?.status === 'PROCESSING';
function publicError(error: unknown): string {
  // Backend worker failures and 500 details can contain provider internals.
  if (error instanceof ApiError && error.status >= 500) return 'The server could not complete this request. Please retry.';
  return errorMessage(error);
}

// Shared by the React hook and deterministic polling tests. Each generation has
// its own cancellation scope; late responses cannot replace a newer suggestion.
export class AiSuggestionController {
  private state = initialState();
  private listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private run = 0;
  private api: AiApi;
  private ticketId: string;
  private intervalMs: number;
  private timeoutMs: number;

  constructor(api: AiApi, ticketId: string, options: { intervalMs?: number; timeoutMs?: number } = {}) {
    this.api = api;
    this.ticketId = ticketId;
    this.intervalMs = options.intervalMs ?? 2000;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AiState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private cancel() {
    this.run++;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.request?.abort();
  }
  stop = () => {
    this.cancel();
    this.update({ generating: false, polling: false, submitting: null });
  };

  generate = async () => {
    // Update synchronously below, so a second click is blocked before React rerenders.
    if (this.state.generating || this.state.submitting || isPending(this.state.suggestion)) return;
    this.cancel();
    const run = this.run;
    const request = new AbortController();
    this.request = request;
    this.update({ ...initialState(), generating: true });
    this.deadline = setTimeout(() => {
      this.cancel();
      this.update({ generating: false, polling: false, error: 'Generation is taking longer than expected. Generate a fresh suggestion to try again.' });
    }, this.timeoutMs);
    try {
      const suggestion = await this.api.generate(this.ticketId, request.signal);
      if (run !== this.run) return;
      this.update({ suggestion, generating: false, polling: isPending(suggestion) });
      if (isPending(suggestion)) this.schedule(suggestion.id, run, request, 0);
      else clearTimeout(this.deadline);
    } catch (error) {
      if (run !== this.run) return;
      clearTimeout(this.deadline);
      this.update({ generating: false, polling: false, error: publicError(error) });
    }
  };

  private schedule(id: string, run: number, request: AbortController, failures: number) {
    this.timer = setTimeout(() => { void this.poll(id, run, request, failures); }, this.intervalMs);
  }
  private async poll(id: string, run: number, request: AbortController, failures: number) {
    try {
      const suggestion = await this.api.get(id, request.signal);
      if (run !== this.run) return;
      this.update({ suggestion, polling: isPending(suggestion) });
      if (isPending(suggestion)) this.schedule(id, run, request, 0);
      else clearTimeout(this.deadline);
    } catch (error) {
      if (run !== this.run) return;
      const permanent = error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (permanent || failures + 1 >= 3) {
        clearTimeout(this.deadline);
        this.update({ polling: false, error: `Could not check the suggestion. ${publicError(error)} Generate a fresh suggestion to retry.` });
      } else this.schedule(id, run, request, failures + 1);
    }
  }

  submit = async (payload: FeedbackRequest): Promise<FeedbackResponse | null> => {
    const suggestion = this.state.suggestion;
    if (!suggestion || suggestion.status !== 'COMPLETED' || this.state.feedback || this.state.conflict || this.state.submitting) return null;
    if (payload.feedback_type !== 'REJECTED' && !suggestion.draft_text?.trim()) return null;
    if (payload.feedback_type === 'EDITED' && !payload.final_text.trim()) {
      this.update({ error: 'Enter a reply before sending.' }); return null;
    }
    const run = this.run;
    const request = new AbortController();
    this.request = request;
    this.update({ submitting: payload.feedback_type, error: '' });
    const timeout = setTimeout(() => request.abort(), 30_000);
    this.deadline = timeout;
    try {
      const feedback = await this.api.feedback(suggestion.id, payload, request.signal);
      if (run !== this.run) return null;
      this.update({ feedback, submitting: null });
      return feedback;
    } catch (error) {
      if (run !== this.run) return null;
      const conflict = error instanceof ApiError && error.status === 409;
      this.update({ submitting: null, conflict, error: conflict
        ? `${publicError(error)} The suggestion may be stale or already reviewed. Generate a fresh suggestion.`
        : request.signal.aborted ? 'The feedback result could not be confirmed. Refresh the conversation before retrying.' : publicError(error) });
      return null;
    } finally { clearTimeout(timeout); }
  };
}
