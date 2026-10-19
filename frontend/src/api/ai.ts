import type { ApiClient } from './client';
import type { AiSuggestionResponse, FeedbackRequest, FeedbackResponse } from '../features/ai/types';

export const aiApi = (client: ApiClient) => ({
  generate: (ticketId: string, signal: AbortSignal) => client.request<AiSuggestionResponse>(
    `/tickets/${ticketId}/ai-suggestions`, { method: 'POST', signal },
  ),
  get: (id: string, signal: AbortSignal) => client.request<AiSuggestionResponse>(
    `/ai-suggestions/${id}`, { signal },
  ),
  feedback: (id: string, feedback: FeedbackRequest, signal: AbortSignal) => client.request<FeedbackResponse>(
    `/ai-suggestions/${id}/feedback`, { method: 'POST', body: JSON.stringify(feedback), signal },
  ),
});
export type AiApi = ReturnType<typeof aiApi>;
