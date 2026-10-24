export interface User { id: string; email: string; name: string; role: 'AGENT' | 'ADMIN' | 'CUSTOMER' }
export interface Session { access_token: string; token_type: string; user: User }
export interface Ticket {
  id: string; customer_id: string; assigned_agent_id: string | null;
  primary_category_id: string; title: string; customer_urgency: 'NORMAL' | 'URGENT';
  status: string; priority: string;
  created_at?: string; updated_at?: string; last_message_at?: string;
  resolved_at?: string | null; closed_at?: string | null;
}
export interface Message {
  id: string; ticket_id: string; author_user_id: string;
  message_type: 'CUSTOMER_REPLY' | 'AGENT_REPLY'; body: string;
  created_at: string; edited_at: string | null; deleted_at: string | null;
  attachments: Attachment[];
}
export type Queue = 'unassigned' | 'assigned_to_me';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface InternalNote { id: string; ticket_id: string; author_user_id: string; author_email: string; body: string; created_at: string }
export interface Attachment {
  id: string; message_id: string; uploaded_by_user_id: string; original_filename: string;
  storage_key: string; mime_type: string; size_bytes: number; checksum: string | null;
  upload_status: 'PENDING' | 'UPLOADED' | 'FAILED' | 'EXPIRED'; created_at: string; uploaded_at: string | null;
}
export interface UploadMetadata { attachment_id: string; upload_url: string; storage_key: string; expires_in: number }
export interface DownloadMetadata { download_url: string; expires_in: number }
