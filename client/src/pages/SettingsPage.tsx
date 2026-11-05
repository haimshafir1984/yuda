import { useQuery } from '@tanstack/react-query';
import { Badge, Card, Column, DataTable, ErrorBlock, FutureNotice, InlineAlert, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface DemoUser { id: number; name: string; role: string; roleLabel: string }
interface RolesInfo { areas: Record<string, string>; roles: { role: string; label: string; permissions: Record<string, number> }[] }

const LEVEL_LABEL = ['אין גישה', 'צפייה', 'עריכה', 'ניהול'];
const LEVEL_TONE = ['gray', 'blue', 'teal', 'green'] as const;

export default function SettingsPage() {
  const { me } = useAuth();
  const users = useQuery({ queryKey: ['auth', 'demo-users'], queryFn: () => api.get<DemoUser[]>('/auth/demo-users') });
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: () => api.get<RolesInfo>('/auth/roles') });

  const userCols: Column<DemoUser>[] = [
    { key: 'n', header: 'שם', cell: (u) => <span className="font-medium">{u.name}{u.id === me?.user?.id && <span className="ms-2 text-xs text-slate-500">(אתם)</span>}</span> },
    { key: 'r', header: 'תפקיד', cell: (u) => u.roleLabel },
  ];

  const matrixCols: Column<RolesInfo['roles'][number]>[] = [
    { key: 'r', header: 'תפקיד', cell: (r) => <span className="font-medium">{r.label}</span> },
    ...Object.entries(roles.data?.areas ?? {}).map(([area, label]) => ({
      key: area,
      header: label,
      cell: (r: RolesInfo['roles'][number]) => <Badge tone={LEVEL_TONE[r.permissions[area]]}>{LEVEL_LABEL[r.permissions[area]]}</Badge>,
    })),
  ];

  return (
    <>
      <PageHeader title="הגדרות" breadcrumbs={[{ label: 'הגדרות' }]} />
      <div className="space-y-5">
        <Card>
          <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">תפקידים והרשאות</h2>
          {roles.isLoading ? <Spinner /> : roles.error ? <ErrorBlock error={roles.error} onRetry={() => roles.refetch()} /> : <DataTable caption="מטריצת הרשאות" columns={matrixCols} rows={roles.data!.roles} rowKey={(r) => r.role} />}
          <div className="space-y-2 border-t border-slate-100 p-3 text-xs text-slate-600">
            <p>עו"סית (תפקיד רגיל) רואה הכל, ועורכת רק פניות, תהליכי ליווי ושפ"ח המשויכים אליה או שאינם משויכים. אחות ומגשר רואים רק פניות מהקטגוריה שלהם (בריאות או גישור).</p>
            <p>אישור סטטוס תשלום, ניהול מטפלים ופרסום סדנה דורשים הרשאת ניהול.</p>
          </div>
        </Card>
        <Card>
          <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">משתמשי הדגמה</h2>
          {users.isLoading ? <Spinner /> : users.error ? <ErrorBlock error={users.error} /> : <DataTable caption="משתמשי הדגמה" columns={userCols} rows={users.data!} rowKey={(u) => u.id} />}
        </Card>
        <InlineAlert tone="amber">הכניסה להדגמה היא בלי סיסמה. הרשאות נאכפות בשרת, אך אין עדיין סיסמאות, אימות או הצפנה. לפני נתונים אמיתיים יש להוסיף אותם.</InlineAlert>
        <FutureNotice title="הגדרות נוספות" text="ניסוחי ברירת מחדל להודעות ושעות תזכורת יתווספו בשלב הבא." />
      </div>
    </>
  );
}
