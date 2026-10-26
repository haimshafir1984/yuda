import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Column, DataTable, EmptyState, ErrorBlock, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime, priorityLabel, priorityTone, requestStatusLabel, requestStatusTone, requestTypeLabel } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { ServiceRequest } from '../../lib/types';

export const useStaff = () => useQuery({ queryKey: ['service-meta'], queryFn: () => api.get<{ staff: string[] }>('/service-meta') });

export default function RequestsList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [assignee, setAssignee] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('openedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const dq = useDebounced(q);
  const staff = useStaff();

  const params = { q: dq, status, type, assignee, from, to, sort, order };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['service-requests', params], queryFn: () => api.get<ServiceRequest[]>('/service-requests', params) });

  const onSort = (key: string) => {
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setOrder('asc'); }
  };
  const open = (r: ServiceRequest) => nav(`/requests/${r.id}`);

  const columns: Column<ServiceRequest>[] = [
    { key: 'id', header: 'מספר פנייה', sortKey: 'id', cell: (r) => `#${r.id}` },
    { key: 'opened', header: 'תאריך פתיחה', sortKey: 'openedAt', cell: (r) => fmtDate(r.openedAt) },
    {
      key: 'member', header: 'שם החבר', sortKey: 'member',
      cell: (r) => <Link to={`/members/${r.memberId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-teal-700 hover:underline">{r.memberName}</Link>,
    },
    { key: 'type', header: 'סוג פנייה', sortKey: 'type', cell: (r) => requestTypeLabel[r.type] ?? r.type },
    { key: 'subject', header: 'נושא', sortKey: 'subject', cell: (r) => <span className="font-medium text-slate-900">{r.subject}</span> },
    { key: 'assignee', header: 'גורם אחראי', sortKey: 'assignee', cell: (r) => r.assignee ?? <span className="text-slate-400">לא שויך</span> },
    { key: 'priority', header: 'עדיפות', sortKey: 'priority', cell: (r) => <Badge tone={priorityTone(r.priority)}>{priorityLabel[r.priority]}</Badge> },
    { key: 'status', header: 'סטטוס', sortKey: 'status', cell: (r) => <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel[r.status]}</Badge> },
    { key: 'updated', header: 'עדכון אחרון', sortKey: 'updatedAt', cell: (r) => fmtDateTime(r.updatedAt) },
  ];

  const filtered = !!(dq || status || type || assignee || from || to);
  return (
    <>
      <PageHeader
        title="פניות ובקשות סיוע"
        breadcrumbs={[{ label: 'פניות ובקשות סיוע' }]}
        actions={<Button variant="primary" onClick={() => nav('/requests/new')}><Plus className="size-4" aria-hidden /> פנייה חדשה</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label="חיפוש לפי חבר, מספר פנייה או נושא" placeholder="חיפוש לפי חבר, מספר פנייה או נושא" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="סינון לפי סטטוס" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {Object.entries(requestStatusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="סינון לפי סוג פנייה" className="w-48" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">כל הסוגים</option>
            {Object.entries(requestTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select aria-label="סינון לפי גורם אחראי" className="w-40" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">כל הגורמים</option>
            {(staff.data?.staff ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <label className="text-xs text-slate-600">מתאריך<Input type="date" className="mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-slate-600">עד תאריך<Input type="date" className="mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {isLoading ? <Spinner /> : error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : (
          <DataTable
            caption="פניות ובקשות סיוע"
            columns={columns}
            rows={data!}
            rowKey={(r) => r.id}
            onRowClick={open}
            sort={{ sort, order }}
            onSort={onSort}
            empty={<EmptyState title={filtered ? 'לא נמצאו פניות התואמות לחיפוש' : 'עדיין אין פניות'} text={filtered ? 'נסו לשנות את החיפוש או את הסינון.' : 'פתחו את הפנייה הראשונה כדי להתחיל.'} />}
          />
        )}
      </Card>
    </>
  );
}
