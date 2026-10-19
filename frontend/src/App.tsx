import { useEffect, useState } from 'react';
import { ApiClient, ApiError, errorMessage } from './api/client';
import type { Session } from './api/types';
import { Login } from './features/auth/Login';
import { AgentWorkspace } from './features/tickets/AgentWorkspace';
import { AppShell } from './components/AppShell';
import './App.css';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [client] = useState(() => new ApiClient(setSession));
  const [starting, setStarting] = useState(true);
  const [notice, setNotice] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    let active = true;
    client.refresh().catch((err: unknown) => {
      if (active && !(err instanceof ApiError && err.status === 401)) setNotice(errorMessage(err));
    }).finally(() => { if (active) setStarting(false); });
    return () => { active = false; };
  }, [client]);
  async function logout() {
    setLoggingOut(true); setNotice('');
    try { await client.logout(); } catch (err) { setNotice(errorMessage(err)); }
    finally { setLoggingOut(false); }
  }
  if (starting) return <main className="session-loading" role="status">Restoring your session…</main>;
  if (!session) return <Login notice={notice} onLogin={async (email, password) => {
    setNotice(''); await client.login(email, password);
  }} />;
  if (session.user.role !== 'AGENT') return <main className="login-page"><section className="login-card">
    <h1>Agent access required</h1><p>This account does not have the AGENT role.</p>
    {notice && <p role="alert" className="error">{notice}</p>}
    <button onClick={logout} disabled={loggingOut}>Sign out</button>
  </section></main>;
  return <AppShell user={session.user} loggingOut={loggingOut} onLogout={logout} notice={notice}>
    <AgentWorkspace client={client} user={session.user} />
  </AppShell>;
}
