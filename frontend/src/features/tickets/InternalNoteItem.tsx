import type { InternalNote } from '../../api/types';

export function InternalNoteItem({ note, userId }: { note: InternalNote; userId?: string }) {
  return <article className="internal-note"><header><div className="note-author"><strong>{note.author_email}</strong>{note.author_user_id === userId && <span className="muted">You</span>}</div>
    <time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time></header><p>{note.body}</p></article>;
}
