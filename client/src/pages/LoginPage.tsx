import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAction } from '../components/toast';
import { Badge, Button, Card, Column, DataTable, ErrorBlock, InlineAlert, Spinner } from '../components/ui';
import { api } from '../lib/api';

interface DemoUser { id: number; name: string; role: string; roleLabel: string }

const roleTone = (role: string) => (role === 'GENERAL_MANAGER' ? 'teal' : role.includes('SOCIAL') ? 'green' : role === 'NURSE' || role === 'MEDIATOR' ? 'blue' : 'gray') as 'teal' | 'green' | 'blue' | 'gray';

/** כניסה להדגמה בלי סיסמה: בוחרים משתמש קיים. ההרשאות נאכפות בשרת לפי התפקיד */
export default function LoginPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['auth', 'demo-users'], queryFn: () => api.get<DemoUser[]>('/auth/demo-users') });
  const login = useAction((id: number) => api.post('/auth/login', { userId: id }), {
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });

  const columns: Column<DemoUser>[] = [
    { key: 'n', header: 'שם', cell: (u) => <span className="font-medium text-slate-900">{u.name}</span> },
    { key: 'r', header: 'תפקיד', cell: (u) => <Badge tone={roleTone(u.role)}>{u.roleLabel}</Badge> },
    {
      key: 'a',
      header: 'כניסה',
      cell: (u) => (
        <Button variant="primary" size="sm" loading={login.isPending && login.variables === u.id} onClick={() => login.mutate(u.id)} aria-label={`כניסה בשם ${u.name}, ${u.roleLabel}`}>
          כניסה כ{u.roleLabel}
        </Button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-10 place-items-center rounded-lg bg-teal-600 text-lg font-bold text-white" aria-hidden>י</span>
          <h1 className="text-2xl font-bold text-slate-900">החצר של יודה</h1>
        </div>
        <Card>
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900">כניסה להדגמה</h2>
            <p className="mt-1 text-sm text-slate-600">בחרו משתמש כדי להיכנס בשמו. כל תפקיד רואה ויכול לעשות דברים שונים.</p>
          </div>
          {users.isLoading ? <Spinner /> : users.error ? <ErrorBlock error={users.error} onRetry={() => users.refetch()} /> : <DataTable caption="משתמשי הדגמה" columns={columns} rows={users.data!} rowKey={(u) => u.id} />}
        </Card>
        <div className="mt-4">
          <InlineAlert tone="amber">מצב הדגמה: אין סיסמאות, וכל מי שיש לו את הקישור יכול לבחור תפקיד. הנתונים במערכת בדויים.</InlineAlert>
        </div>
      </main>
    </div>
  );
}
