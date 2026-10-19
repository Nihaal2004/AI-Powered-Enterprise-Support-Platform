import type { ReactNode } from 'react';
import type { User } from '../api/types';
import { RouteLink } from '../navigation/RouteLink';
import { Icon } from './Icon';

export function AppShell({ user, loggingOut, onLogout, notice, children }: {
  user: User; loggingOut: boolean; onLogout: () => void; notice: string; children: ReactNode;
}) {
  return <div className="app-shell"><aside className="app-sidebar" aria-label="Application sidebar">
    <div className="brand"><span className="brand-mark">ES</span><div><strong>Enterprise Support</strong><small>Agent workspace</small></div></div>
    <div className="sidebar-navigation"><p className="sidebar-label">Workspace</p><nav aria-label="Main navigation"><RouteLink href="/tickets" aria-current="page"><Icon name="tickets" />Tickets</RouteLink></nav></div>
    <div className="account"><div className="account-identity"><span className="account-avatar" aria-hidden="true">{user.name?.charAt(0) || 'A'}</span><span>{user.name}<small title={user.email}>{user.email}</small></span></div><button disabled={loggingOut} onClick={onLogout}><Icon name="logout" />{loggingOut ? 'Signing out…' : 'Sign out'}</button></div>
  </aside><main className="app-content" id="main-content">{notice && <p role="alert" className="error">{notice}</p>}{children}</main></div>;
}
