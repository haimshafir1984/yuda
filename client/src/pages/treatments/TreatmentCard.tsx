import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Pencil, Stamp } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Badge, Button, Dialog, ErrorBlock, InlineAlert, PageHeader, Spinner, Tabs, TabsContent, TabsList } from '../../components/ui';
import { api } from '../../lib/api';
import { trackLabel, treatmentStatusLabel, treatmentStatusTone } from '../../lib/format';
import type { Treatment } from '../../lib/types';
import { ActionsTab, BasicTab, FeedbackTab, MoreTab, SocialReportsTab, TimelineTab } from './TreatmentTabs';

export default function TreatmentCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const [tab, setTab] = useState('basic');
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState(false);
  const { data: t, isLoading, error, refetch } = useQuery({ queryKey: ['treatment', id], queryFn: () => api.get<Treatment>(`/treatments/${id}`) });
  const sign = useAction(() => api.post(`/treatments/${id}/sign-demo`), { success: 'הטיפול הופעל (סימון ידני לצורך הדגמה)', onSuccess: () => setSigning(false), onError: () => setSigning(false) });

  if (isLoading) return <Spinner />;
  if (error || !t) return <ErrorBlock error={error ?? new Error('התהליך לא נמצא')} onRetry={() => refetch()} />;

  const tabs = [
    { value: 'basic', label: 'פרטים בסיסיים' },
    { value: 'timeline', label: 'ציר הזמן של הטיפול' },
    { value: 'social', label: 'דוחות עו״סית' },
    { value: 'feedback', label: 'משובים', future: true },
    { value: 'actions', label: 'פעולות במהלך שפ״ח' },
    { value: 'more', label: 'פרטים נוספים' },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'שפ״ח', to: '/treatments' }, { label: `תהליך #${t.id}` }]}
        title={<>תהליך שפ״ח #{t.id}: <Link className="text-teal-700 hover:underline" to={`/members/${t.memberId}`}>{t.memberName}</Link></>}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone={treatmentStatusTone(t.status)}>{treatmentStatusLabel[t.status]}</Badge>
            <span>{trackLabel[t.track]}</span>
            <span>מטפל: {t.therapist?.fullName ?? 'טרם נבחר'}</span>
            <span>{t.heldSessions} מתוך {t.approvedSessions} פגישות</span>
          </span>
        }
        actions={
          <>
            {t.status === 'PENDING_CONTRACT' && (
              <Button variant="primary" onClick={() => setSigning(true)}><Stamp className="size-4" aria-hidden /> סמן חוזה כחתום לצורך הדגמה</Button>
            )}
            <Button onClick={() => { setTab('basic'); setEditing(true); }}><Pencil className="size-4" aria-hidden /> עריכה</Button>
            <Button onClick={() => nav('/treatments')}><ArrowRight className="size-4" aria-hidden /> חזרה לרשימה</Button>
          </>
        }
      />
      {t.status === 'PENDING_THERAPIST' && <div className="mb-4"><InlineAlert tone="amber">התהליך ממתין להתאמת מטפל. ניתן לשייך מטפל בטאב "פעולות במהלך שפ״ח".</InlineAlert></div>}
      {t.status === 'PENDING_CONTRACT' && <div className="mb-4"><InlineAlert tone="amber">התהליך ממתין לחתימת מטופל על חוזה. במערכת זו אין חתימה דיגיטלית, ולכן ניתן לסמן חתימה ידנית לצורך הדגמה.</InlineAlert></div>}
      {t.status === 'PENDING_EXTENSION_SIGNATURE' && <div className="mb-4"><InlineAlert tone="amber">מכסת הפגישות המאושרת מוצתה, וממתינה הארכה לחתימת המטופל. בטאב "פעולות במהלך שפ״ח" ניתן לסמן את חוזה ההארכה כחתום (הדגמה).</InlineAlert></div>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList tabs={tabs} />
        <TabsContent value="basic"><BasicTab key={editing ? 'edit' : 'view'} t={t} editing={editing} setEditing={setEditing} /></TabsContent>
        <TabsContent value="timeline"><TimelineTab t={t} /></TabsContent>
        <TabsContent value="social"><SocialReportsTab t={t} /></TabsContent>
        <TabsContent value="feedback"><FeedbackTab /></TabsContent>
        <TabsContent value="actions"><ActionsTab t={t} /></TabsContent>
        <TabsContent value="more"><MoreTab t={t} /></TabsContent>
      </Tabs>
      <Dialog
        open={signing}
        onOpenChange={(o) => !sign.isPending && setSigning(o)}
        title="סימון חוזה כחתום (הדגמה)"
        description='הפעולה משנה את הסטטוס ל"פעיל" ומתועדת בהיסטוריה כפעולה ידנית. לא נחתם מסמך בפועל, ולא יוצג חוזה חתום.'
        footer={<><Button variant="primary" loading={sign.isPending} onClick={() => sign.mutate(undefined)}>סמן כחתום</Button><Button onClick={() => setSigning(false)} disabled={sign.isPending}>ביטול</Button></>}
      />
    </>
  );
}
