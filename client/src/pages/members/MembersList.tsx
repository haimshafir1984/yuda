import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Column, DataTable, EmptyState, ErrorBlock, Input, Ltr, PageHeader, Pagination, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, genderLabel } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { MemberRow, Paged } from '../../lib/types';

const PAGE_SIZE = 15;

export default function MembersList() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [ni, setNi] = useState('');
  const [sort, setSort] = useState('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const params = { q: dq, gender, nationalInsurance: ni, sort, order, page, pageSize: PAGE_SIZE };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['members', params],
    queryFn: () => api.get<Paged<MemberRow>>('/members', params),
    placeholderData: keepPreviousData,
  });

  const onSort = (key: string) => {
    if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      setOrder('asc');
    }
    setPage(1);
  };
  const open = (m: MemberRow) => nav(`/members/${m.id}`);

  const columns: Column<MemberRow>[] = [
    { key: 'name', header: 'שם מלא', sortKey: 'name', cell: (m) => <span className="font-medium text-slate-900">{m.fullName}</span> },
    { key: 'phone', header: 'מספר טלפון', sortKey: 'phone', cell: (m) => <Ltr>{m.phone}</Ltr> },
    { key: 'age', header: 'גיל', sortKey: 'age', cell: (m) => m.age ?? '—' },
    { key: 'gender', header: 'מגדר', sortKey: 'gender', cell: (m) => (m.gender ? genderLabel[m.gender] : '—') },
    { key: 'joinDate', header: 'תאריך הצטרפות', sortKey: 'joinDate', cell: (m) => fmtDate(m.joinDate) },
    { key: 'ni', header: 'ביטוח לאומי', sortKey: 'nationalInsurance', cell: (m) => (m.nationalInsurance ? <Badge tone="teal">כן</Badge> : <Badge>לא</Badge>) },
    { key: 'count', header: 'סדנאות שנרשם אליהן', sortKey: 'workshopCount', cell: (m) => m.workshopCount },
    {
      key: 'open',
      header: 'פעולה',
      cell: (m) => (
        <Button size="sm" onClick={(e) => { e.stopPropagation(); open(m); }} aria-label={`פתיחת כרטיס החבר ${m.fullName}`}>
          פתח כרטיס
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="חברים"
        breadcrumbs={[{ label: 'חברים' }]}
        actions={
          <Button variant="primary" onClick={() => nav('/members/new')}>
            <Plus className="size-4" aria-hidden /> הוסף חבר חדש
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              type="search"
              aria-label="חיפוש חבר לפי שם, טלפון או תעודת זהות"
              placeholder="חיפוש לפי שם, טלפון או תעודת זהות"
              className="ps-9"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
          <Select aria-label="סינון לפי מגדר" className="w-36" value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}>
            <option value="">כל המגדרים</option>
            <option value="MALE">גבר</option>
            <option value="FEMALE">אישה</option>
          </Select>
          <Select aria-label="סינון לפי ביטוח לאומי" className="w-48" value={ni} onChange={(e) => { setNi(e.target.value); setPage(1); }}>
            <option value="">ביטוח לאומי: הכל</option>
            <option value="true">שייכים לתכנית</option>
            <option value="false">לא שייכים</option>
          </Select>
        </div>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <DataTable
              caption="טבלת חברים"
              columns={columns}
              rows={data!.items}
              rowKey={(m) => m.id}
              onRowClick={open}
              sort={{ sort, order }}
              onSort={onSort}
              empty={
                <EmptyState
                  title={dq || gender || ni ? 'לא נמצאו חברים התואמים לחיפוש' : 'עדיין אין חברים במערכת'}
                  text={dq || gender || ni ? 'נסו לשנות את החיפוש או את הסינון.' : 'הוסיפו את החבר הראשון כדי להתחיל.'}
                />
              }
            />
            <Pagination page={data!.page} pageSize={data!.pageSize} total={data!.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
