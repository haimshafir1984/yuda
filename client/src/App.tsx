import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Card, EmptyState, Spinner } from './components/ui';
import { api } from './lib/api';
import { Area, useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import MemberCard from './pages/members/MemberCard';
import MemberCreate from './pages/members/MemberCreate';
import MembersList from './pages/members/MembersList';
import MyEvents from './pages/MyEvents';
import PublicRegister from './pages/PublicRegister';
import RequestCard from './pages/requests/RequestCard';
import RequestCreate from './pages/requests/RequestCreate';
import RequestsList from './pages/requests/RequestsList';
import SettingsPage from './pages/SettingsPage';
import SocialCard from './pages/social/SocialCard';
import SocialCreate from './pages/social/SocialCreate';
import SocialList from './pages/social/SocialList';
import TreatmentCard from './pages/treatments/TreatmentCard';
import TreatmentCreate from './pages/treatments/TreatmentCreate';
import TreatmentsList from './pages/treatments/TreatmentsList';
import WorkshopCard from './pages/workshops/WorkshopCard';
import WorkshopCreate from './pages/workshops/WorkshopCreate';
import WorkshopsList from './pages/workshops/WorkshopsList';

/** בלי משתמש מחובר מוצג מסך הכניסה להדגמה */
// ברירת המחדל: כניסה אוטומטית כמנהל כללי (רואה הכל). אחרי "החלפת משתמש" מוצג מסך הבחירה
const PICK_FLAG = 'crm-pick-user';
const flagged = () => { try { return sessionStorage.getItem(PICK_FLAG) === '1'; } catch { return false; } };
function AuthGate() {
  const { me, loading } = useAuth();
  const qc = useQueryClient();
  const needsAuto = !loading && !me?.user && !flagged();
  const auto = useMutation({
    mutationFn: async () => {
      const users = await api.get<{ id: number; role: string }[]>('/auth/demo-users');
      const gm = users.find((u) => u.role === 'GENERAL_MANAGER') ?? users[0];
      if (gm) await api.post('/auth/login', { userId: gm.id });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
  useEffect(() => { if (needsAuto && auto.isIdle) auto.mutate(); }, [needsAuto, auto]);
  if (loading || (needsAuto && !auto.isError)) return <Spinner />;
  if (!me?.user) return <LoginPage />;
  return <Outlet />;
}

function NoAccess() {
  return (
    <Card className="p-10">
      <EmptyState title="אין לך הרשאה לאזור זה" text="התפקיד שלך אינו כולל גישה לאזור הזה. ניתן להחליף משתמש מהתפריט העליון." />
    </Card>
  );
}

const Guard = ({ area, children }: { area: Area; children: ReactNode }) => {
  const { can } = useAuth();
  return can(area) ? <>{children}</> : <NoAccess />;
};

/** דף הבית: האזור הראשון שהתפקיד מורשה אליו */
function Home() {
  const { can } = useAuth();
  const first = (
    [['members', '/members'], ['workshops', '/workshops'], ['requests', '/requests'], ['treatments', '/treatments'], ['socialWork', '/social-work']] as [Area, string][]
  ).find(([area]) => can(area));
  return first ? <Navigate to={first[1]} replace /> : <NoAccess />;
}

const g = (area: Area, el: ReactNode) => <Guard area={area}>{el}</Guard>;

export default function App() {
  return (
    <Routes>
      {/* דפים ציבוריים, בלי כניסת צוות: הרישום המדומה ודף האירועים של החבר */}
      <Route path="/register/:id" element={<PublicRegister />} />
      <Route path="/my-events" element={<MyEvents />} />
      <Route element={<AuthGate />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/members" element={g('members', <MembersList />)} />
          <Route path="/members/new" element={g('members', <MemberCreate />)} />
          <Route path="/members/:id" element={g('members', <MemberCard />)} />
          <Route path="/workshops" element={g('workshops', <WorkshopsList />)} />
          <Route path="/workshops/new" element={g('workshops', <WorkshopCreate />)} />
          <Route path="/workshops/:id" element={g('workshops', <WorkshopCard />)} />
          <Route path="/treatments" element={g('treatments', <TreatmentsList />)} />
          <Route path="/treatments/new" element={g('treatments', <TreatmentCreate />)} />
          <Route path="/treatments/:id" element={g('treatments', <TreatmentCard />)} />
          <Route path="/requests" element={g('requests', <RequestsList />)} />
          <Route path="/requests/new" element={g('requests', <RequestCreate />)} />
          <Route path="/requests/:id" element={g('requests', <RequestCard />)} />
          <Route path="/social-work" element={g('socialWork', <SocialList />)} />
          <Route path="/social-work/new" element={g('socialWork', <SocialCreate />)} />
          <Route path="/social-work/:id" element={g('socialWork', <SocialCard />)} />
          <Route path="/settings" element={g('settings', <SettingsPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
