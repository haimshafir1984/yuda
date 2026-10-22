import { FutureNotice, PageHeader } from '../components/ui';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="הגדרות" breadcrumbs={[{ label: 'הגדרות' }]} />
      <FutureNotice title="בפיתוח עתידי" text="הגדרות המערכת יתווספו בשלב הבא. ב-POC זה אין הגדרות הניתנות לשינוי." />
    </>
  );
}
