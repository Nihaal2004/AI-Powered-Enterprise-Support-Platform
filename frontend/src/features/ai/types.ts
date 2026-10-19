export type AiSuggestionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'STALE';

// CitationService.build_citations supplies these fields. Numbers are source IDs,
// not offsets into this array; page_number is null for TXT documents.
export interface Citation {
  citation: number;
  chunk_id?: string;
  document_id?: string;
  chunk_index?: number;
  page_number?: number | null;
  similarity?: number;
}

export interface AiSuggestionResponse {
  id: string;
  ticket_id: string;
  requested_by_user_id: string;
  conversation_version: number;
  status: AiSuggestionStatus;
  draft_text: string | null;
  citations: Citation[] | null;
  created_at: string;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
}

export type FeedbackRequest =
  | { feedback_type: 'ACCEPTED' | 'REJECTED'; final_text?: never }
  | { feedback_type: 'EDITED'; final_text: string };

export interface FeedbackResponse {
  id: string;
  suggestion_id: string;
  feedback_by_user_id: string;
  feedback_type: FeedbackRequest['feedback_type'];
  final_text: string | null;
  created_at: string;
}
