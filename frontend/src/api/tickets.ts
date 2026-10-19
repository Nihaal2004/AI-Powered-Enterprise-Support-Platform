import type { ApiClient } from './client';
import type { Message, Queue, Ticket, TicketStatus, TicketPriority, InternalNote, Attachment, UploadMetadata, DownloadMetadata } from './types';

export const ticketApi = (client: ApiClient) => ({
  queue: (queue: Queue, signal: AbortSignal) => client.request<Ticket[]>(`/tickets?${queue}=true`, { signal }),
  detail: (id: string, signal?: AbortSignal) => client.request<Ticket>(`/tickets/${id}`, { signal }),
  messages: (id: string, signal?: AbortSignal) => client.request<Message[]>(`/tickets/${id}/messages`, { signal }),
  claim: (id: string) => client.request<Ticket>(`/tickets/${id}/claim`, { method: 'POST' }),
  reply: (id: string, body: string) => client.request<Message>(`/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  notes: (id: string, signal?: AbortSignal) => client.request<InternalNote[]>(`/tickets/${id}/internal-notes`, { signal }),
  addNote: (id: string, body: string) => client.request<InternalNote>(`/tickets/${id}/internal-notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  status: (id: string, status: TicketStatus) => client.request<Ticket>(`/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  priority: (id: string, priority: TicketPriority) => client.request<Ticket>(`/tickets/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority }) }),
  edit: (id: string, messageId: string, body: string) => client.request<Message>(`/tickets/${id}/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
  delete: (id: string, messageId: string) => client.request<Message>(`/tickets/${id}/messages/${messageId}`, { method: 'DELETE' }),
  attachments: (id: string, messageId: string, signal?: AbortSignal) => client.request<Attachment[]>(`/tickets/${id}/messages/${messageId}/attachments`, { signal }),
  presign: (id: string, messageId: string, file: File) => client.request<UploadMetadata>(`/tickets/${id}/messages/${messageId}/attachments/presign`, {
    method: 'POST', body: JSON.stringify({ filename: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size }),
  }),
  confirm: (id: string, messageId: string, attachmentId: string) => client.request<Attachment>(`/tickets/${id}/messages/${messageId}/attachments/${attachmentId}/confirm`, { method: 'POST' }),
  download: (id: string, messageId: string, attachmentId: string) => client.request<DownloadMetadata>(`/tickets/${id}/messages/${messageId}/attachments/${attachmentId}/download`),
});
export type TicketApi = ReturnType<typeof ticketApi>;
