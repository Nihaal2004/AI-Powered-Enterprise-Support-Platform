import type { Session, User } from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please retry.';

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    let message = response.status >= 500 ? 'The server could not complete this request. Please retry.'
      : response.status === 403 ? 'You do not have permission to perform this action.'
      : response.status === 404 ? 'The requested resource was not found.'
      : response.status === 409 ? 'This action conflicts with the current state. Refresh and retry.'
      : response.status === 422 ? 'Please check the submitted values and try again.'
      : `Request failed (${response.status}).`;
    if (response.status < 500 && data && typeof data === 'object' && 'detail' in data) {
      if (typeof data.detail === 'string') message = data.detail;
      else if (Array.isArray(data.detail)) message = 'Please check the submitted values and try again.';
    }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

// One client per mounted application. Tokens never leave memory.
export class ApiClient {
  private token: string | null = null;
  private refreshing: Promise<Session> | null = null;
  private generation = 0;
  private onSession: (session: Session | null) => void;
  constructor(onSession: (session: Session | null) => void) { this.onSession = onSession; }

  private async auth(path: string, body?: object): Promise<Session> {
    return read<Session>(await fetch(`/api/auth/${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }));
  }
  async login(email: string, password: string) {
    const session = await this.auth('login', { email, password });
    session.user = await read<User>(await fetch('/api/auth/me', {
      credentials: 'include', headers: { Authorization: `Bearer ${session.access_token}` },
    }));
    this.generation++;
    this.token = session.access_token;
    this.onSession(session);
  }
  refresh(): Promise<Session> {
    if (!this.refreshing) {
      const generation = this.generation;
      this.refreshing = this.auth('refresh').then(session => {
        if (generation !== this.generation) throw new ApiError(401, 'Session changed. Please sign in again.');
        this.token = session.access_token;
        this.onSession(session);
        return session;
      }).catch((error: unknown) => {
        if (generation === this.generation) { this.token = null; this.onSession(null); }
        throw error;
      }).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
  async logout() {
    // Let cookie rotation finish before revoking the active refresh session.
    if (this.refreshing) await this.refreshing.catch(() => undefined);
    await read<void>(await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
    this.generation++;
    this.token = null;
    this.onSession(null);
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const generation = this.generation;
    const sentToken = this.token;
    const send = () => fetch(`/api${path}`, { ...init, credentials: 'include', headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers, ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    } });
    let response = await send();
    if (response.status === 401 && generation === this.generation) {
      if (sentToken === this.token) await this.refresh();
      response = await send();
      if (response.status === 401) { this.token = null; this.onSession(null); }
    }
    return read<T>(response);
  }
}
