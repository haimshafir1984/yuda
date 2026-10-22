import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Badge, Button, Card, ErrorBlock, FutureNotice, Ltr, PageHeader, Spinner, Tabs, TabsContent, TabsList } from '../../components/ui';
import { api } from '../../lib/api';
import { channelLabel, fmtDate, fmtTenure, genderLabel, maritalLabel } from '../../lib/format';
import type { Member } from '../../lib/types';
import MemberForm, { fromMember } from './MemberForm';
import { ActivityTab, ExceptionsTab, PreferencesTab, RestrictionsTab } from './MemberTabs';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || '—'}</dd>
    </div>
  );
}

function PersonalTab({ member, editing, setEditing }: { member: Member; editing: boolean; setEditing: (e: boolean) => void }) {
  const save = useAction((payload: unknown) => api.put<Member>(`/members/${member.id}`, payload), {
    success: 'פרטי החבר נשמרו',
    silentCodes: ['DUPLICATE_PHONE', 'DUPLICATE_NATIONAL_ID', 'VALIDATION'],
    onSuccess: () => setEditing(false),
  });

  if (editing)
    return (
      <Card className="p-5">
        <MemberForm initial={fromMember(member)} submitLabel="שמירת שינויים" saving={save.isPending} onSubmit={(p) => save.mutateAsync(p)} onCancel={() => setEditing(false)} />
      </Card>
    );
  return (
    <Card className="p-5">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="שם פרטי">{member.firstName}</Detail>
        <Detail label="שם משפחה">{member.lastName}</Detail>
        <Detail label="מגדר">{member.gender ? genderLabel[member.gender] : ''}</Detail>
        <Detail label="טלפון">{<Ltr>{member.phone}</Ltr>}</Detail>
        <Detail label="מייל">{member.email ? <Ltr>{member.email}</Ltr> : ''}</Detail>
        <Detail label="תעודת זהות">{member.nationalId ? <Ltr>{member.nationalId}</Ltr> : ''}</Detail>
        <Detail label="שנת לידה">{member.birthYear ? String(member.birthYear) : ''}</Detail>
        <Detail label="מצב משפחתי">{member.maritalStatus ? maritalLabel[member.maritalStatus] : ''}</Detail>
        <Detail label="שייך לתכנית ביטוח לאומי">{member.nationalInsurance ? 'כן' : 'לא'}</Detail>
        <Detail label="ערוץ תקשורת מועדף">{channelLabel[member.preferredChannel]}</Detail>
        <Detail label="תאריך הצטרפות">{fmtDate(member.joinDate)}</Detail>
      </dl>
      <Button className="mt-5" onClick={() => setEditing(true)}>
        <Pencil className="size-4" aria-hidden /> עריכת פרטים
      </Button>
    </Card>
  );
}

export default function MemberCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('personal');
  const { data: m, isLoading, error, refetch } = useQuery({ queryKey: ['member', id], queryFn: () => api.get<Member>(`/members/${id}`) });

  if (isLoading) return <Spinner />;
  if (error || !m) return <ErrorBlock error={error ?? new Error('החבר לא נמצא')} onRetry={() => refetch()} />;

  const tabs = [
    { value: 'personal', label: 'פרטים אישיים' },
    { value: 'intake', label: 'פרטי קבלה', future: true },
    { value: 'activity', label: 'פעילות קבוצתית' },
    ...(m.nationalInsurance ? [{ value: 'ni', label: 'ביטוח לאומי', future: true }] : []),
    { value: 'social', label: 'שירותים סוציאליים', future: true },
    { value: 'family', label: 'קשר משפחתי', future: true },
    { value: 'ledger', label: 'כרטסת', future: true },
    { value: 'prefs', label: 'העדפות' },
    { value: 'restrictions', label: 'הגבלות' },
    { value: 'exceptions', label: 'חריגות' },
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : 'personal';

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'חברים', to: '/members' }, { label: m.fullName }]}
        title={m.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>מספר חבר: {m.id}</span>
            <span>טלפון: <Ltr>{m.phone}</Ltr></span>
            <span>גיל: {m.age ?? 'לא ידוע'}</span>
            <span>ותק: {fmtTenure(m.tenure)}</span>
            {m.nationalInsurance && <Badge tone="teal">ביטוח לאומי</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              onClick={() => {
                setTab('personal');
                setEditing(true);
              }}
            >
              <Pencil className="size-4" aria-hidden /> עריכה
            </Button>
            <Button onClick={() => nav('/members')}>
              <ArrowRight className="size-4" aria-hidden /> חזרה לרשימת החברים
            </Button>
          </>
        }
      />
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList tabs={tabs} />
        <TabsContent value="personal">
          <PersonalTab member={m} editing={editing} setEditing={setEditing} />
        </TabsContent>
        <TabsContent value="intake">
          <FutureNotice title="פרטי קבלה" text="מודול זה יפותח בשלב הבא" />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab memberId={m.id} />
        </TabsContent>
        <TabsContent value="ni">
          <FutureNotice title="ביטוח לאומי" text="מודול זה יפותח בשלב הבא" />
        </TabsContent>
        <TabsContent value="social">
          <FutureNotice title="שירותים סוציאליים" text="בפיתוח עתידי" />
        </TabsContent>
        <TabsContent value="family">
          <FutureNotice title="קשר משפחתי" text="בפיתוח עתידי" />
        </TabsContent>
        <TabsContent value="ledger">
          <FutureNotice title="כרטסת" text="בפיתוח עתידי" />
        </TabsContent>
        <TabsContent value="prefs">
          <PreferencesTab member={m} />
        </TabsContent>
        <TabsContent value="restrictions">
          <RestrictionsTab memberId={m.id} />
        </TabsContent>
        <TabsContent value="exceptions">
          <ExceptionsTab memberId={m.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
