import type { Message, TicketStatus } from '../../api/types';

export const isTicketLocked = (status: string) => status === 'RESOLVED' || status === 'CLOSED';

// UI guidance only: every mutation is still validated by the backend.
export const transitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'], CLOSED: [],
};
// MessageResponse currently exposes no can_edit/can_delete flags.
export function canModify(message: Message, userId: string, now = Date.now()) {
  return message.message_type === 'AGENT_REPLY' && message.author_user_id === userId && !message.deleted_at
    && now <= Date.parse(message.created_at) + 15 * 60 * 1000;
}
