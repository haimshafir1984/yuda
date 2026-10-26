import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import type { Member, MemberRow, Paged } from '../lib/types';
import { Button, Column, DataTable, EmptyState, Input, Ltr, Spinner } from './ui';

export interface PickedMember { id: number; name: string }

/** בחירת חבר קיים בלבד (לא יוצרים חבר חדש מתוך טפסי השירות). presetId: חבר שנבחר מראש מכרטיס החבר */
export default function MemberPicker({ value, onChange, presetId, error }: { value: PickedMember | null; onChange: (m: PickedMember | null) => void; presetId?: number | null; error?: string }) {
  const [search, setSearch] = useState('');
  const dq = useDebounced(search);

  useQuery({
    queryKey: ['member', presetId],
    queryFn: async () => {
      const m = await api.get<Member>(`/members/${presetId}`);
      onChange({ id: m.id, name: m.fullName });
      return m;
    },
    enabled: !!presetId && !value,
  });
  const results = useQuery({ queryKey: ['members', 'picker', dq], queryFn: () => api.get<Paged<MemberRow>>('/members', { q: dq, pageSize: 6 }), enabled: !value });

  const cols: Column<MemberRow>[] = [
    { key: 'n', header: 'שם', cell: (m) => <span className="font-medium">{m.fullName}</span> },
    { key: 'p', header: 'טלפון', cell: (m) => <Ltr>{m.phone}</Ltr> },
    { key: 'a', header: 'גיל', cell: (m) => m.age ?? '—' },
    { key: 'c', header: '', cell: (m) => <Button size="sm" variant="primary" aria-label={`בחירת ${m.fullName}`} onClick={() => onChange({ id: m.id, name: m.fullName })}>בחר</Button> },
  ];

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">חבר <span className="text-red-600" aria-hidden>*</span></p>
      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium">{value.name}</span>
          {!presetId && <Button size="sm" onClick={() => onChange(null)}>שינוי חבר</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label="חיפוש חבר קיים" placeholder="חיפוש חבר קיים לפי שם, טלפון או תעודת זהות" className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {results.data ? <DataTable caption="תוצאות חיפוש חברים" columns={cols} rows={results.data.items} rowKey={(m) => m.id} empty={<EmptyState title="לא נמצאו חברים" />} /> : <Spinner />}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
