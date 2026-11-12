import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api';

export type Area = 'members' | 'workshops' | 'treatments' | 'requests' | 'socialWork' | 'settings';
/** 0 אין גישה, 1 צפייה, 2 עריכה, 3 ניהול */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL = { VIEW: 1, EDIT: 2, MANAGE: 3 } as const;

export interface Me {
  user: { id: number; name: string; role: string; roleLabel: string } | null;
  permissions: Record<Area, Level> | null;
  authDisabled: boolean;
}

interface AuthValue {
  me: Me | undefined;
  loading: boolean;
  level: (area: Area) => Level;
  can: (area: Area, min?: Level) => boolean;
}
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['auth', 'me'], queryFn: () => api.get<Me>('/auth/me') });
  // תוקף ההתחברות פג (401 מהשרת): נטען מחדש את המשתמש, ויוצג מסך הכניסה
  useEffect(() => {
    const h = () => void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    window.addEventListener('crm-auth-expired', h);
    return () => window.removeEventListener('crm-auth-expired', h);
  }, [qc]);

  const level = (area: Area): Level => q.data?.permissions?.[area] ?? 0;
  const value: AuthValue = { me: q.data, loading: q.isLoading, level, can: (area, min = LEVEL.VIEW) => level(area) >= min };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** הרשאה לאזור: האם לתפקיד הנוכחי יש לפחות את הרמה הנתונה */
export const useCan = (area: Area, min: Level = LEVEL.EDIT) => useAuth().can(area, min);

export const AREA_PREFIX: [string, Area][] = [
  ['/members', 'members'],
  ['/workshops', 'workshops'],
  ['/treatments', 'treatments'],
  ['/requests', 'requests'],
  ['/social-work', 'socialWork'],
  ['/complaints', 'socialWork'],
  ['/mediations', 'requests'],
  ['/settings', 'settings'],
];
export const areaOfPathname = (pathname: string): Area | null => AREA_PREFIX.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? null;

// ---------- מצב צפייה בלבד: לפי האזור, או לפי שיוך הרשומה (עו"סית עורכת רק את שלה) ----------
const ReadOnlyContext = createContext<{ readOnly: boolean; reason?: string }>({ readOnly: false });

export function ReadOnlyScope({ readOnly, reason, children }: { readOnly: boolean; reason?: string; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={{ readOnly, reason }}>{children}</ReadOnlyContext.Provider>;
}

export function useEditState(): { readOnly: boolean; reason?: string } {
  const { level } = useAuth();
  const { pathname } = useLocation();
  const scope = useContext(ReadOnlyContext);
  const area = areaOfPathname(pathname);
  if (area && level(area) < LEVEL.EDIT) return { readOnly: true, reason: 'אין לך הרשאת עריכה באזור זה. התפקיד שלך מאפשר צפייה בלבד.' };
  return scope;
}

/** האם הרשומה משויכת לעובד אחר? עו"סית (תפקיד רגיל) עורכת רק רשומות שלה או שאינן משויכות */
export function useIsForeign(owner: string | null | undefined): { foreign: boolean; reason?: string } {
  const { me } = useAuth();
  const foreign = me?.user?.role === 'SOCIAL_WORKER' && !!owner && owner !== me.user.name;
  return foreign ? { foreign: true, reason: `הרשומה משויכת ל${owner}. אפשר לערוך רק רשומות המשויכות אליך או שאינן משויכות.` } : { foreign: false };
}
