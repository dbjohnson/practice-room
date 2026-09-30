import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writePrivate } from './files';

export interface Identity {
  subject: string;
  email: string;
  name: string;
}
interface Session {
  user: Identity;
  expires: number;
  csrf: string;
}
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class Sessions {
  private entries: Record<string, Session> = {};
  constructor(
    private path?: string,
    private now = () => Date.now(),
  ) {
    if (path && existsSync(path)) {
      const stored = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Session>;
      for (const [key, session] of Object.entries(stored))
        if (
          /^[a-f0-9]{64}$/.test(key) &&
          session.expires > now() &&
          typeof session.user?.subject === 'string' &&
          typeof session.user.email === 'string' &&
          typeof session.user.name === 'string' &&
          typeof session.csrf === 'string'
        )
          this.entries[key] = session;
    }
  }
  create(user: Identity) {
    for (const [key, session] of Object.entries(this.entries))
      if (session.expires <= this.now()) delete this.entries[key];
    if (Object.keys(this.entries).length >= 10000) throw new Error('Session capacity reached.');
    const id = token();
    this.entries[digest(id)] = { user, expires: this.now() + 12 * 3600_000, csrf: token() };
    this.persist();
    return id;
  }
  get(id = '') {
    const session = this.entries[digest(id)];
    return session?.expires > this.now() ? session : null;
  }
  remove(id: string) {
    delete this.entries[digest(id)];
    this.persist();
  }
  private persist() {
    if (this.path) writePrivate(this.path, this.entries);
  }
}

export function cookie(header: string | undefined, name: string) {
  const part = header
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return part?.slice(name.length + 1) ?? '';
}

export function localReturn(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\r\n]/.test(decoded)) return '/';
  } catch {
    return '/';
  }
  return value;
}
