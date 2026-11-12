import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, ErrorBlock, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { CandidateFull, candidateStatusLabel, howHeardOptions } from '../../lib/intake';

/** "פרטי קבלה" בכרטיס חבר: קישור לכרטיס המועמדות שממנו נוצר החבר, ותמצית ההצטרפות */
export default function IntakeInfoTab({ memberId }: { memberId: number }) {
  const can = useCan('intake', 1);
  const q = useQuery({ queryKey: ['member-intake', memberId], queryFn: () => api.get<CandidateFull | null>(`/members/${memberId}/intake`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  if (!c) return <Card><EmptyState title="אין כרטיס מועמדות" text="החבר נוצר ישירות במערכת ולא דרך תהליך הקבלה." /></Card>;
  const filled = c.questionnaires.find((x) => x.filledAt);
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">{candidateStatusLabel[c.status]}</Badge>
        <span className="text-sm text-slate-600">הבקשה הוגשה {fmtDate(c.submittedAt)}</span>
        {c.signups[0] && <span className="text-sm text-slate-600">ראיון קבוצתי: {c.signups[0].sessionName}</span>}
        {filled && <Badge tone="teal">מולא שאלון היכרות</Badge>}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs font-medium text-slate-500">איך שמע/ה עלינו</dt><dd className="text-sm">{c.howHeard ? howHeardOptions[c.howHeard] ?? c.howHeard : '—'}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500">קהילה</dt><dd className="text-sm">{c.community ?? '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-medium text-slate-500">מה הביא אותו/ה להצטרף</dt><dd className="whitespace-pre-line text-sm">{c.whyJoin ?? '—'}</dd></div>
      </dl>
      {can ? <Link className="text-sm font-medium text-teal-700 hover:underline" to={`/intake/candidates/${c.id}`}>לכרטיס המועמדות המלא (כולל שאלון ההיכרות וההיסטוריה)</Link> : <p className="text-xs text-slate-500">כרטיס המועמדות המלא זמין לצוות הקבלה.</p>}
    </Card>
  );
}
