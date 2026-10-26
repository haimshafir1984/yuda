import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import MemberCard from './pages/members/MemberCard';
import MemberCreate from './pages/members/MemberCreate';
import MembersList from './pages/members/MembersList';
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

export default function App() {
  return (
    <Routes>
      {/* דף הרישום המדומה הוא מסך נפרד מה-CRM */}
      <Route path="/register/:id" element={<PublicRegister />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/members" replace />} />
        <Route path="/members" element={<MembersList />} />
        <Route path="/members/new" element={<MemberCreate />} />
        <Route path="/members/:id" element={<MemberCard />} />
        <Route path="/workshops" element={<WorkshopsList />} />
        <Route path="/workshops/new" element={<WorkshopCreate />} />
        <Route path="/workshops/:id" element={<WorkshopCard />} />
        <Route path="/treatments" element={<TreatmentsList />} />
        <Route path="/treatments/new" element={<TreatmentCreate />} />
        <Route path="/treatments/:id" element={<TreatmentCard />} />
        <Route path="/requests" element={<RequestsList />} />
        <Route path="/requests/new" element={<RequestCreate />} />
        <Route path="/requests/:id" element={<RequestCard />} />
        <Route path="/social-work" element={<SocialList />} />
        <Route path="/social-work/new" element={<SocialCreate />} />
        <Route path="/social-work/:id" element={<SocialCard />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/members" replace />} />
      </Route>
    </Routes>
  );
}
