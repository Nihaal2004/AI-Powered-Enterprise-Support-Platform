import { useEffect, useState } from 'react';
import type { TicketApi } from '../../api/tickets';
import type { Attachment } from '../../api/types';
import { errorMessage } from '../../api/client';

export function Attachments({ api, ticketId, messageId, revision }: { api: TicketApi; ticketId: string; messageId: string; revision: number }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(() => setLink(null), Math.max(0, link.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [link]);
  useEffect(() => {
    const controller = new AbortController();
    api.attachments(ticketId, messageId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setFiles(value); setError(''); }
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(errorMessage(err)); });
    return () => controller.abort();
  }, [api, ticketId, messageId, revision, retry]);
  return <div className="attachments" aria-label="Attachments">{files.map(file => <div className="file-row" key={file.id}>
    <span>{file.original_filename}<small>{(file.size_bytes / 1024).toFixed(1)} KB · {file.mime_type}</small></span>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError(''); setLink(null);
      try {
        const metadata = await api.download(ticketId, messageId, file.id);
        setLink({ url: metadata.download_url, expiresAt: Date.now() + metadata.expires_in * 1000 });
        const anchor = document.createElement('a'); anchor.href = metadata.download_url; anchor.rel = 'noopener noreferrer'; anchor.target = '_blank'; anchor.click();
      } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
    }}>Download</button></div>)}
    {link && <a href={link.url} target="_blank" rel="noopener noreferrer">Open temporary download link</a>}
    {error && <p className="error" role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Reload attachments</button></p>}
  </div>;
}
