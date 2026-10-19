import type { TicketApi } from '../../api/tickets';
import type { UploadMetadata } from '../../api/types';

export function validateFile(file: File) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a nonempty file up to 10 MB.');
  if (file.name.length > 255) throw new Error('Filename must be at most 255 characters.');
}

export async function uploadAttachment(api: TicketApi, ticketId: string, messageId: string, file: File) {
  validateFile(file);
  let metadata: UploadMetadata;
  try { metadata = await api.presign(ticketId, messageId, file); }
  catch (error) {
    if (error instanceof TypeError) throw new Error('Could not request the file upload from the support server. Check your connection and retry the attachment.', { cause: error });
    throw error;
  }
  // Deliberately bypass ApiClient: never send application credentials to S3.
  let response: Response;
  try {
    response = await fetch(metadata.upload_url, {
      method: 'PUT', credentials: 'omit', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file,
    });
  } catch {
    // Browsers hide CORS failures and network failures behind the same fetch error.
    // Do not surface the signed URL or suggest that the already-saved reply failed.
    throw new Error('File storage could not be reached or the browser blocked the upload. Your reply is saved. Retry the attachment; if this persists, the storage connection needs checking.');
  }
  if (!response.ok) throw new Error(`File upload failed (${response.status}). Retry the attachment to request a fresh upload URL.`);
  try { return await api.confirm(ticketId, messageId, metadata.attachment_id); }
  catch (error) {
    if (error instanceof TypeError) throw new Error('The file reached storage, but upload confirmation could not reach the support server. Retry the attachment.', { cause: error });
    throw error;
  }
}

