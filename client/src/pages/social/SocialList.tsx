import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Column, DataTable, EmptyState, ErrorBlock, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime, kindLabel2, processTypeLabel, socialStatusLabel, socialStatusTone } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { SocialProcess } from '../../lib/types';
import { useStaff } from '../requests/RequestsList';

export default function SocialList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [worker, setWorker] = useState('');
  const [sort, setSort] = useState('startDate');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const dq = useDebounced(q);
  const staff = useStaff();

  const params = { q: dq, status, kind, worker, sort, order };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['social-processes', params], queryFn: () => api.get<SocialProcess[]>('/social-work/processes', params) });
  const onSort = (key: string) => {
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setOrder('asc'); }
  };
  const open = (p: SocialProcess) => nav(`/social-work/${p.id}`);

  const columns: Column<SocialProcess>[] = [
    { key: 'id', header: 'מזהה תהליך', sortKey: 'id', cell: (p) => `#${p.id}` },
    { key: 'member', header: 'שם החבר', sortKey: 'member', cell: (p) => <Link to={`/members/${p.memberId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-teal-700 hover:underline">{p.memberName}</Link> },
    { key: 'worker', header: 'שם העו״סית', sortKey: 'worker', cell: (p) => p.socialWorker ?? <span className="text-slate-400">לא שויכה</span> },
    { key: 'kinds', header: 'מהות הליווי', cell: (p) => p.kinds.map((k) => kindLabel2[k]).join(', ') },
    { key: 'type', header: 'סוג התהליך', cell: (p) => processTypeLabel[p.type] },
    { key: 'start', header: 'תאריך התחלה', sortKey: 'startDate', cell: (p) => fmtDate(p.startDate) },
    { key: 'meetings', header: 'מספר פגישות', sortKey: 'meetings', cell: (p) => p.meetingCount },
    { key: 'status', header: 'סטטוס', sortKey: 'status', cell: (p) => <Badge tone={socialStatusTone(p.status)}>{socialStatusLabel[p.status]}</Badge> },
    { key: 'last', header: 'פעילות אחרונה', sortKey: 'lastActivity', cell: (p) => fmtDateTime(p.lastActivity) },
  ];
  const filtered = !!(dq || status || kind || worker);
  return (
    <>
      <PageHeader
        title="ליווי עו״ס"
        breadcrumbs={[{ label: 'ליווי עו״ס' }]}
        actions={<Button variant="primary" onClick={() => nav('/social-work/new')}><Plus className="size-4" aria-hidden /> פתח תהליך ליווי חדש</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label="חיפוש לפי חבר או מטרה" placeholder="חיפוש לפי שם חבר, מספר תהליך או מטרה" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="סינון לפי עו״סית" className="w-40" value={worker} onChange={(e) => setWorker(e.target.value)}>
            <option value="">כל העו״סיות</option>
            {(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select aria-label="סינון לפי סטטוס" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {Object.entries(socialStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="סינון לפי מהות הליווי" className="w-48" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">כל המהויות</option>
            {Object.entries(kindLabel2).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        {isLoading ? <Spinner /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : (
          <DataTable
            caption="תהליכי ליווי עו״ס"
            columns={columns}
            rows={data!}
            rowKey={(p) => p.id}
            onRowClick={open}
            sort={{ sort, order }}
            onSort={onSort}
            empty={<EmptyState title={filtered ? 'לא נמצאו תהליכים התואמים לחיפוש' : 'עדיין אין תהליכי ליווי'} text={filtered ? 'נסו לשנות את החיפוש או את הסינון.' : 'פתחו את תהליך הליווי הראשון כדי להתחיל.'} />}
          />
        )}
      </Card>
    </>
  );
}
