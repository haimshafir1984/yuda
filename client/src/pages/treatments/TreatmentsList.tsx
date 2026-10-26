import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Column, DataTable, EmptyState, ErrorBlock, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, trackLabel, treatmentStatusLabel, treatmentStatusTone } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { Treatment } from '../../lib/types';
import TherapistsDialog from './TherapistsDialog';

export default function TreatmentsList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [track, setTrack] = useState('');
  const [sort, setSort] = useState('startDate');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [therapists, setTherapists] = useState(false);
  const dq = useDebounced(q);

  const params = { q: dq, status, track, sort, order };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['treatments', params], queryFn: () => api.get<Treatment[]>('/treatments', params) });

  const onSort = (key: string) => {
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setOrder('asc'); }
  };
  const open = (t: Treatment) => nav(`/treatments/${t.id}`);

  const columns: Column<Treatment>[] = [
    { key: 'id', header: 'מזהה תהליך', sortKey: 'id', cell: (t) => `#${t.id}` },
    {
      key: 'member',
      header: 'שם החבר',
      sortKey: 'member',
      cell: (t) => (
        <Link to={`/members/${t.memberId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-teal-700 hover:underline">
          {t.memberName}
        </Link>
      ),
    },
    { key: 'therapist', header: 'מטפל נוכחי', sortKey: 'therapist', cell: (t) => t.therapist?.fullName ?? <span className="text-slate-400">טרם נבחר</span> },
    { key: 'sw', header: 'עו״סית אחראית', cell: (t) => t.socialWorker ?? '—' },
    { key: 'track', header: 'מסלול', cell: (t) => trackLabel[t.track] },
    { key: 'held', header: 'פגישות שהתקיימו', sortKey: 'held', cell: (t) => t.heldSessions },
    { key: 'approved', header: 'פגישות מאושרות', sortKey: 'approved', cell: (t) => t.approvedSessions },
    { key: 'status', header: 'סטטוס', sortKey: 'status', cell: (t) => <Badge tone={treatmentStatusTone(t.status)}>{treatmentStatusLabel[t.status]}</Badge> },
    { key: 'start', header: 'תאריך תחילת הטיפול', sortKey: 'startDate', cell: (t) => fmtDate(t.startDate) },
  ];

  const filtered = !!(dq || status || track);
  return (
    <>
      <PageHeader
        title="ליווי טיפול פסיכולוגי (שפ״ח)"
        breadcrumbs={[{ label: 'שפ״ח' }]}
        actions={
          <>
            <Button variant="primary" onClick={() => nav('/treatments/new')}>
              <Plus className="size-4" aria-hidden /> פתיחת תהליך שפ״ח חדש
            </Button>
            <Button onClick={() => setTherapists(true)}>
              <Users className="size-4" aria-hidden /> ניהול מטפלים
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label="חיפוש לפי שם חבר או מטפל" placeholder="חיפוש לפי שם חבר או מטפל" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="סינון לפי סטטוס" className="w-60" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {Object.entries(treatmentStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="סינון לפי מסלול" className="w-40" value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="">כל המסלולים</option>
            <option value="PRIVATE">{trackLabel.PRIVATE}</option>
            <option value="SMAT">{trackLabel.SMAT}</option>
          </Select>
        </div>
        {isLoading ? <Spinner /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : (
          <DataTable
            caption="תהליכי שפ״ח"
            columns={columns}
            rows={data!}
            rowKey={(t) => t.id}
            onRowClick={open}
            sort={{ sort, order }}
            onSort={onSort}
            empty={<EmptyState title={filtered ? 'לא נמצאו תהליכים התואמים לחיפוש' : 'עדיין אין תהליכי שפ״ח'} text={filtered ? 'נסו לשנות את החיפוש או את הסינון.' : 'פתחו את התהליך הראשון כדי להתחיל.'} />}
          />
        )}
      </Card>
      <TherapistsDialog open={therapists} onOpenChange={setTherapists} />
    </>
  );
}
