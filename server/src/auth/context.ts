import { AsyncLocalStorage } from 'async_hooks';
import type { Role } from './permissions';

export interface AuthUser {
  id: number;
  name: string;
  role: Role;
  /** true כשההרשאות כבויות (AUTH_DISABLED=1) ואין משתמש מזוהה: פועלים כמנהל כללי ללא שם */
  synthetic?: boolean;
}

const storage = new AsyncLocalStorage<{ user: AuthUser | null }>();

export const runWithUser = <T>(user: AuthUser | null, fn: () => T): T => storage.run({ user }, fn);
export const currentUser = (): AuthUser | null => storage.getStore()?.user ?? null;

/** שם המבצע לרישום בהיסטוריה. null כשאין משתמש מזוהה (סידינג, בדיקות, הרשאות כבויות) */
export const currentActorName = (): string | null => {
  const u = currentUser();
  return u && !u.synthetic ? u.name : null;
};
