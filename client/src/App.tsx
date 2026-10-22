import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import MemberCard from './pages/members/MemberCard';
import MemberCreate from './pages/members/MemberCreate';
import MembersList from './pages/members/MembersList';
import PublicRegister from './pages/PublicRegister';
import SettingsPage from './pages/SettingsPage';
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/members" replace />} />
      </Route>
    </Routes>
  );
}
