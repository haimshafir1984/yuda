import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Column, DataTable, EmptyState, ErrorBlock, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney, fmtTimeRange, kindLabel, statusLabel } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { Workshop } from '../../lib/types';

export const statusTone = (s: string) => (s === 'ONGOING' ? 'green' : s === 'PUBLISHED' ? 'blue' : s === 'CANCELLED' ? 'red' : s === 'FINISHED' ? 'gray' : 'amber') as 'green' | 'blue' | 'red' | 'gray' | 'amber';

export default function WorkshopsList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('startDate');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const dq = useDebounced(q);

  const params = { q: dq, status, kind, sort, order };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['workshops', params], queryFn: () => api.get<Workshop[]>('/workshops', params) });

  const onSort = (key: string) => {
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      setOrder('asc');
    }
  };
  const open = (w: Workshop) => nav(`/workshops/${w.id}`);

  const columns: Column<Workshop>[] = [
    {
      key: 'name',
      header: 'שם הסדנה/אירוע',
      sortKey: 'name',
      cell: (w) => (
        <div>
          <div className="font-medium text-slate-900">{w.name}</div>
          {w.subtitle && <div className="text-xs text-slate-500">{w.subtitle}</div>}
        </div>
      ),
    },
    { key: 'kind', header: 'סוג', cell: (w) => kindLabel[w.kind] },
    { key: 'start', header: 'תאריך התחלה', sortKey: 'startDate', cell: (w) => (w.startDate ? <div>{fmtDate(w.startDate)}<div className="text-xs text-slate-500">{fmtTimeRange(w.startTime, w.endTime)}</div></div> : 'טרם נקבע') },
    { key: 'end', header: 'תאריך סיום', cell: (w) => (w.endDate && w.endDate !== w.startDate ? fmtDate(w.endDate) : '—') },
    { key: 'fac', header: 'מנחה', cell: (w) => w.facilitator ?? '—' },
    { key: 'status', header: 'סטטוס', sortKey: 'status', cell: (w) => <Badge tone={statusTone(w.status)}>{statusLabel[w.status]}</Badge> },
    { key: 'reg', header: 'מצב הרשמה', cell: (w) => (w.registrationOpen ? <Badge tone="green">רישום פתוח</Badge> : <Badge>רישום סגור</Badge>) },
    { key: 'count', header: 'נרשמים', sortKey: 'registrantCount', cell: (w) => w.registrantCount },
    { key: 'price', header: 'מחיר', sortKey: 'price', cell: (w) => (w.isPaid ? fmtMoney(w.price) : 'ללא תשלום') },
    {
      key: 'open',
      header: 'פעולה',
      cell: (w) => (
        <Button size="sm" onClick={(e) => { e.stopPropagation(); open(w); }} aria-label={`פתיחת ${w.name}`}>
          פתח
        </Button>
      ),
    },
  ];

  const filtered = !!(dq || status || kind);
  return (
    <>
      <PageHeader
        title="סדנאות ואירועים"
        breadcrumbs={[{ label: 'סדנאות ואירועים' }]}
        actions={
          <>
            <Button variant="primary" onClick={() => nav('/workshops/new?kind=WORKSHOP')}>
              <Plus className="size-4" aria-hidden /> סדנה חדשה
            </Button>
            <Button onClick={() => nav('/workshops/new?kind=EVENT')}>
              <CalendarPlus className="size-4" aria-hidden /> אירוע חדש
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label="חיפוש סדנה או אירוע" placeholder="חיפוש לפי שם או מנחה" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="סינון לפי סטטוס" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {Object.entries(statusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="סינון לפי סוג" className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">כל הסוגים</option>
            <option value="WORKSHOP">סדנה</option>
            <option value="EVENT">אירוע</option>
          </Select>
        </div>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => refetch()} />
        ) : (
          <DataTable
            caption="טבלת סדנאות ואירועים"
            columns={columns}
            rows={data!}
            rowKey={(w) => w.id}
            onRowClick={open}
            sort={{ sort, order }}
            onSort={onSort}
            empty={<EmptyState title={filtered ? 'לא נמצאו סדנאות התואמות לחיפוש' : 'עדיין אין סדנאות או אירועים'} text={filtered ? 'נסו לשנות את החיפוש או את הסינון.' : 'צרו את הסדנה הראשונה כדי להתחיל.'} />}
          />
        )}
      </Card>
    </>
  );
}
