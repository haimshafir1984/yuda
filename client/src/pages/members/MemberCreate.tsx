import { useNavigate } from 'react-router-dom';
import { useAction } from '../../components/toast';
import { Card, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import type { Member } from '../../lib/types';
import MemberForm, { emptyMember } from './MemberForm';

export default function MemberCreate() {
  const nav = useNavigate();
  const create = useAction((payload: unknown) => api.post<Member>('/members', payload), {
    success: 'החבר נוצר בהצלחה',
    silentCodes: ['DUPLICATE_PHONE', 'DUPLICATE_NATIONAL_ID', 'VALIDATION'],
    onSuccess: (m) => nav(`/members/${m.id}`),
  });

  return (
    <>
      <PageHeader
        title="הוספת חבר חדש"
        subtitle="ניתן להשלים פרטים נוספים בכרטיס החבר בהמשך"
        breadcrumbs={[{ label: 'חברים', to: '/members' }, { label: 'חבר חדש' }]}
      />
      <Card className="p-5">
        <MemberForm
          initial={emptyMember()}
          submitLabel="שמירה ומעבר לכרטיס החבר"
          saving={create.isPending}
          onSubmit={(p) => create.mutateAsync(p)}
          onCancel={() => nav('/members')}
        />
      </Card>
    </>
  );
}
