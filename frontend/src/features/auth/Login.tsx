import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorMessage } from '../../api/client';

export function Login({ onLogin, notice }: { onLogin: (email: string, password: string) => Promise<void>; notice: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin(email, password); } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><form className="login-card" onSubmit={submit}>
    <div className="brand-mark">ES</div><p className="eyebrow">ENTERPRISE SUPPORT</p>
    <h1>Agent sign in</h1><p className="muted">Access your queues and customer conversations.</p>
    {notice && <p role="status" className="notice">{notice}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
    <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <small className="muted">An AGENT account is required.</small>
  </form></main>;
}
