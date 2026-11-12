import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Copy } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { useAction, useToast } from '../../components/toast';
import { Badge, Button, Card, Checkbox, Column, DataTable, Dialog, EmptyState, ErrorBlock, Field, InlineAlert, Input, Ltr, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useEditState } from '../../lib/auth';
import { fmtDate, fmtDateTime, genderLabel, maritalLabel, todayStr } from '../../lib/format';
import {
  CandidateFull, candidateStatusLabel, candidateStatusTone, challengeLabel, degreeTypeLabel, educationLabel, eventLabel, howHeardOptions, jobPercentLabel, leavingTimeLabel,
  livesWithLabel, meetingDecisionLabel, nowDoingLabel, outcomeLabel, rejectionReasonLabel, serviceLabel, signupDecisionLabel, studyKindLabel, wantsLabel,
} from '../../lib/intake';

const fmtDt = (iso: string | null) => (iso ? fmtDateTime(iso) : '—');

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children || '—'}</dd>
    </div>
  );
}

/** תשובות שאלון ההיכרות, מוצגות יחד עם פרטי ההצטרפות כדי שיהיה קל לסקור ולהחליט */
function AnswersView({ a }: { a: Record<string, unknown> }) {
  const s = (k: string) => (a[k] == null || a[k] === '' ? null : String(a[k]));
  const list = (k: string, labels: Record<string, string>) => (Array.isArray(a[k]) && (a[k] as string[]).length ? (a[k] as string[]).map((x) => labels[x] ?? x).join(', ') : null);
  const one = (k: string, labels: Record<string, string>) => (a[k] ? labels[String(a[k])] ?? String(a[k]) : null);
  const rows: [string, string | null][] = [
    ['מה עושה כיום', one('nowDoing', nowDoingLabel)],
    ['מקום עבודה', s('workplace')], ['אחוז משרה', one('jobPercent', jobPercentLabel) && `${one('jobPercent', jobPercentLabel)}${s('jobPercentOther') ? `: ${s('jobPercentOther')}` : ''}`], ['תפקיד', s('jobRole')],
    ['סוג התואר', one('degreeType', degreeTypeLabel)], ['תחום הלימודים', s('studyField')], ['מוסד הלימודים', s('institution')],
    ['מה לומד/ת', s('studyingWhat')], ['מסגרת הלימודים', s('studyFramework')], ['סוג הלימודים', one('studyKind', studyKindLabel)],
    ['תפקיד בשירות', s('serviceRole')], ['פירוט (אחר)', s('nowOther')],
    ['השכלה', one('education', educationLabel)], ['תחום ההשכלה', s('educationField')], ['שירות', one('service', serviceLabel)],
    ['כתובת מגורים', s('address')], ['גר/ה', list('livesWith', livesWithLabel)],
    ['גדל/ה ב', s('grewUpIn')], ['מספר אחים ואחיות', s('siblings')], ['מיקום במשפחה', s('familyPosition')], ['קשר עם המשפחה (1 עד 5)', s('familyRelation')],
    ['זמן בתהליך היציאה', one('leavingTime', leavingTimeLabel)], ['בזמנו הפנוי אוהב/ת', s('hobbies')],
    ['אתגרים מרכזיים', list('challenges', challengeLabel) && `${list('challenges', challengeLabel)}${s('challengesOther') ? ` (${s('challengesOther')})` : ''}`],
    ['מה רוצה למצוא בחצר', list('wants', wantsLabel) && `${list('wants', wantsLabel)}${s('wantsOther') ? ` (${s('wantsOther')})` : ''}`],
    ['עוד משהו לשתף', s('anythingElse')],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.filter(([, v]) => v).map(([l, v]) => <Item key={l} label={l}>{v}</Item>)}
    </dl>
  );
}

const slotInput = (v: string, on: (s: string) => void, label: string) => <Field label={label}><Input type="datetime-local" value={v} onChange={(e) => on(e.target.value)} /></Field>;

export default function CandidateCard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const { push } = useToast();
  const { readOnly } = useEditState();
  const q = useQuery({ queryKey: ['intake-candidate', id], queryFn: () => api.get<CandidateFull>(`/intake/candidates/${id}`) });
  const coords = useQuery({ queryKey: ['intake-coordinators'], queryFn: () => api.get<string[]>('/intake/coordinators') });
  const [more, setMore] = useState(false);
  const [dialog, setDialog] = useState<'reject' | 'call' | 'personal' | 'meeting' | 'decision' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rej, setRej] = useState({ reason: 'NOT_HAREDI', note: '', sendMessage: true });
  const [call, setCall] = useState({ date: todayStr(), summary: '', result: 'NONE', rejectReason: 'OTHER' });
  const [slots, setSlots] = useState(['', '', '']);
  const [when, setWhen] = useState('');
  const [dec, setDec] = useState({ decision: 'ACCEPT', note: '', sendMessage: false });

  const close = () => { setDialog(null); setErrors({}); };
  const opts = { silentCodes: ['VALIDATION'], onError: (e: ApiError) => setErrors(e.code === 'VALIDATION' ? e.fields : { _: e.message }), onSuccess: close };
  const post = (path: string, body?: unknown) => api.post(`/intake/candidates/${id}/${path}`, body);

  const requestClar = useAction(() => post('request-clarification'), { success: 'הסטטוס עודכן: ממתין לשיחת בירור' });
  const reject = useAction(() => post('reject', rej), { ...opts, success: 'המועמד נדחה' });
  const doCall = useAction(() => post('call', call), { ...opts, success: 'שיחת הבירור תועדה' });
  const invite = useAction(() => post('invite-group'), { success: 'נשלחה הזמנה לראיון קבוצתי' });
  const personal = useAction(() => post('invite-personal', { slots: slots.filter(Boolean) }), { ...opts, success: 'נשלחה הזמנה לפגישה אישית' });
  const meeting = useAction(() => post('meeting', { scheduledAt: when }), { ...opts, success: 'נקבעה הפגישה' });
  const held = useAction(() => post('meeting/held'), { success: 'סומן שהפגישה התקיימה' });
  const noShow = useAction(() => post('meeting/no-show'), { success: 'סומן שלא הגיע' });
  const decide = useAction(() => post('personal-decision', dec), { ...opts, success: 'ההחלטה נרשמה' });
  const assign = useAction((coordinator: string) => post('assign', { coordinator }), { success: 'השיוך עודכן' });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBlock error={q.error ?? new Error('המועמד לא נמצא')} onRetry={() => q.refetch()} />;
  const c = q.data;
  const unhandled = ['NEW', 'AWAITING_CLARIFICATION'].includes(c.status);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text.startsWith('http') ? text : `${window.location.origin}${text}`); push('success', 'הקישור הועתק'); } catch { push('error', 'לא ניתן להעתיק'); } };
  const activeMeeting = c.meetings.find((m) => !m.decision && !m.noShow);

  const eventCols: Column<CandidateFull['events'][number]>[] = [
    { key: 'd', header: 'תאריך', cell: (e) => fmtDateTime(e.createdAt) },
    { key: 't', header: 'אירוע', cell: (e) => <Badge>{eventLabel[e.type] ?? e.type}</Badge> },
    { key: 'x', header: 'פרטים', cell: (e) => e.description },
    { key: 'b', header: 'בוצע על ידי', cell: (e) => e.performedBy ?? 'המערכת / המועמד' },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'קבלת חברים', to: '/intake' }, { label: c.fullName }]}
        title={c.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone={candidateStatusTone(c.status)}>{candidateStatusLabel[c.status]}</Badge>
            <span>גיל: {c.age ?? '—'}</span>
            <span>טלפון: <Ltr>{c.phone}</Ltr></span>
            <span>הוגשה {fmtDate(c.submittedAt)}</span>
            {c.isRepeat && <Badge tone="amber">בקשה חוזרת</Badge>}
          </span>
        }
        actions={
          <>
            {c.status === 'NEW' && <Button disabled={readOnly} loading={requestClar.isPending} onClick={() => requestClar.mutate(undefined)}>מצריך שיחת בירור</Button>}
            {unhandled && <Button disabled={readOnly} onClick={() => { setErrors({}); setCall({ date: todayStr(), summary: '', result: 'NONE', rejectReason: 'OTHER' }); setDialog('call'); }}>תיעוד שיחת בירור</Button>}
            {(unhandled || ['AIR', 'MAYBE_FUTURE'].includes(c.status)) && <Button variant="primary" disabled={readOnly} loading={invite.isPending} onClick={() => invite.mutate(undefined)}>הזמן לראיון קבוצתי</Button>}
            {['INVITED_GROUP', 'AIR', 'MAYBE_FUTURE'].includes(c.status) && <Button disabled={readOnly} onClick={() => { setErrors({}); setSlots(['', '', '']); setDialog('personal'); }}>הזמן לפגישה אישית</Button>}
            {unhandled && <Button variant="danger" disabled={readOnly} onClick={() => { setErrors({}); setDialog('reject'); }}>דחייה</Button>}
            <Button onClick={() => nav('/intake')}><ArrowRight className="size-4" aria-hidden /> חזרה לרשימה</Button>
          </>
        }
      />
      <ReadOnlyBanner />
      <div className="space-y-4">
        {c.isRepeat && (
          <InlineAlert tone="amber">
            <span className="block">
              <b>בקשה חוזרת.</b> {c.repeatReason ? `בפעם הקודמת: ${outcomeLabel[c.repeatReason] ?? c.repeatReason}. ` : ''}
              {c.previous && <>הבקשה הקודמת: <Link className="underline" to={`/intake/candidates/${c.previous.id}`}>כרטיס #{c.previous.id}</Link> מתאריך {fmtDate(c.previous.submittedAt)} (סטטוס: {candidateStatusLabel[c.previous.status]}).</>}
            </span>
          </InlineAlert>
        )}
        {c.existingMemberId && !c.memberId && <InlineAlert tone="blue"><span className="block">הפונה כבר מופיע במערכת כחבר: <Link className="underline" to={`/members/${c.existingMemberId}`}>לכרטיס החבר</Link>. בקבלה לא ייווצר כרטיס כפול.</span></InlineAlert>}
        {c.memberId && <InlineAlert tone="green"><span className="block">התקבל לחצר. <Link className="underline" to={`/members/${c.memberId}`}>לכרטיס החבר</Link></span></InlineAlert>}
        {c.status === 'REJECTED' && <InlineAlert tone="red"><span className="block">נדחה: {c.rejectionReason ? rejectionReasonLabel[c.rejectionReason] : ''}{c.rejectionNote ? ` (${c.rejectionNote})` : ''}</span></InlineAlert>}

        <Card className="space-y-4 p-5">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Item label="שם מלא">{c.fullName}</Item>
            <Item label="גיל">{c.age}</Item>
            <Item label="בית ספר יסודי">{c.elementarySchool}</Item>
            <Item label="תיכון / ישיבה">{c.highSchool}</Item>
            <Item label="סטטוס משפחתי ומספר ילדים">{[c.maritalStatus ? maritalLabel[c.maritalStatus] : null, c.childrenCount != null ? `${c.childrenCount} ילדים` : null].filter(Boolean).join(', ')}</Item>
            <Item label="רכז קבלה">
              <Select aria-label="שיוך לרכז קבלה" className="max-w-48" disabled={readOnly} value={c.coordinator ?? ''} onChange={(e) => assign.mutate(e.target.value)}>
                <option value="">לא משויך</option>
                {(coords.data ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </Item>
          </dl>
          <Button size="sm" onClick={() => setMore((m) => !m)}>{more ? 'הסתר' : 'קרא עוד'}</Button>
          {more && (
            <dl className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <Item label="תעודת זהות">{c.nationalId && <Ltr>{c.nationalId}</Ltr>}</Item>
              <Item label="תאריך לידה">{fmtDate(c.birthDate)}</Item>
              <Item label="מין">{c.gender ? genderLabel[c.gender as 'MALE'] : null}</Item>
              <Item label="מייל">{c.email && <Ltr>{c.email}</Ltr>}</Item>
              <Item label="ערוץ מועדף">{c.preferredChannel === 'EMAIL' ? 'מייל' : 'SMS'}</Item>
              <Item label="קהילה חרדית בה גדל/ה">{c.community}</Item>
              <Item label="איך שמע/ה עלינו">{c.howHeard ? howHeardOptions[c.howHeard] ?? c.howHeard : null}</Item>
              <div className="sm:col-span-2 lg:col-span-3"><Item label="מה מביא להצטרף">{<span className="whitespace-pre-line">{c.whyJoin}</span>}</Item></div>
              <div className="sm:col-span-2 lg:col-span-3"><Item label="עוד משהו שכדאי שנדע">{<span className="whitespace-pre-line">{c.anythingElse}</span>}</Item></div>
            </dl>
          )}
        </Card>

        {c.callDate && (
          <Card className="space-y-1 p-5">
            <h2 className="font-semibold text-slate-900">שיחת בירור ({fmtDate(c.callDate)})</h2>
            <p className="whitespace-pre-line text-sm text-slate-700">{c.callSummary}</p>
          </Card>
        )}

        <Card>
          <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">הזמנות והשתבצות</h2>
          <div className="space-y-3 p-3">
            {!c.invitations.length && !c.signups.length && <p className="text-sm text-slate-500">עדיין לא נשלחה הזמנה.</p>}
            {c.invitations.map((i) => (
              <div key={i.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="blue">{i.kind === 'GROUP' ? 'הזמנה לראיון קבוצתי' : 'הזמנה לפגישה אישית'}</Badge>
                  <span>נשלחה {fmtDateTime(i.sentAt)}</span>
                  {i.response === 'SIGNED' && <Badge tone="green">נבחר מועד</Badge>}
                  {i.response === 'NOTE' && <Badge tone="amber">המועמד כתב הערה</Badge>}
                  {!i.response && <Badge>טרם הגיב</Badge>}
                  <Button size="sm" onClick={() => copy(i.link)}><Copy className="size-3.5" aria-hidden /> העתק קישור אישי</Button>
                </div>
                <p className="mt-1 text-slate-600">מועדים שהוצעו: {i.offered.join(' | ')}</p>
                {i.note && <p className="mt-1 whitespace-pre-line text-slate-800">הערת המועמד: {i.note}</p>}
              </div>
            ))}
            {c.signups.map((s) => (
              <p key={s.id} className="text-sm text-slate-700">
                ראיון קבוצתי <Link className="text-teal-700 underline" to={`/intake/sessions/${s.sessionId}`}>{s.sessionName}</Link> ({fmtDate(s.sessionDate)} {s.startTime}):{' '}
                {s.attended === true ? 'הגיע' : s.attended === false ? 'לא הגיע' : 'נוכחות טרם סומנה'}{s.decision ? `, החלטה: ${signupDecisionLabel[s.decision]}` : ''}
              </p>
            ))}
          </div>
        </Card>

        {c.questionnaires.map((qn) => (
          <Card key={qn.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">שאלון היכרות</h2>
              {qn.filledAt ? <Badge tone="green">מולא {fmtDateTime(qn.filledAt)}</Badge> : <Badge tone="amber">נשלח {fmtDateTime(qn.sentAt)}, טרם מולא</Badge>}
              {!qn.filledAt && <Button size="sm" onClick={() => copy(qn.link)}><Copy className="size-3.5" aria-hidden /> העתק קישור</Button>}
            </div>
            {qn.answers && <AnswersView a={qn.answers} />}
          </Card>
        ))}

        {(c.status === 'AWAITING_PERSONAL' || c.meetings.length > 0) && (
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">פגישה אישית לבירור נוסף</h2>
              {c.status === 'AWAITING_PERSONAL' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={readOnly} onClick={() => { setErrors({}); setWhen(''); setDialog('meeting'); }}>{activeMeeting?.scheduledAt ? 'שינוי מועד' : 'קביעת מועד'}</Button>
                  {activeMeeting?.scheduledAt && !activeMeeting.heldAt && <Button size="sm" disabled={readOnly} loading={held.isPending} onClick={() => held.mutate(undefined)}>הפגישה התקיימה</Button>}
                  {activeMeeting?.scheduledAt && <Button size="sm" disabled={readOnly} loading={noShow.isPending} onClick={() => noShow.mutate(undefined)}>לא הגיע</Button>}
                  {activeMeeting?.scheduledAt && <Button size="sm" variant="primary" disabled={readOnly} onClick={() => { setErrors({}); setDec({ decision: 'ACCEPT', note: '', sendMessage: false }); setDialog('decision'); }}>החלטה</Button>}
                </div>
              )}
            </div>
            {c.meetings.map((m) => (
              <p key={m.id} className="text-sm text-slate-700">
                מועד: {fmtDt(m.scheduledAt)}{m.heldAt ? `, התקיימה ${fmtDate(m.heldAt)}` : ''}{m.noShow ? ', לא הגיע' : ''}{m.decision ? `, החלטה: ${meetingDecisionLabel[m.decision]}` : ''}{m.decisionNote ? ` (${m.decisionNote})` : ''}
              </p>
            ))}
            {!c.meetings.length && <p className="text-sm text-slate-500">ממתין שהמועמד יבחר מועד, או שהרכז יקבע ידנית.</p>}
          </Card>
        )}

        <Card>
          <h2 className="border-b border-slate-200 p-3 font-semibold text-slate-900">היסטוריה</h2>
          <DataTable caption="היסטוריית המועמד" columns={eventCols} rows={c.events} rowKey={(e) => e.id} empty={<EmptyState title="אין אירועים" />} />
        </Card>
      </div>

      <Dialog open={dialog === 'reject'} onOpenChange={(o) => !o && !reject.isPending && close()} title="דחיית מועמד"
        footer={<><Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate(undefined)}>דחה</Button><Button onClick={close} disabled={reject.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="הסיבה"><Select value={rej.reason} onChange={(e) => setRej({ ...rej, reason: e.target.value })}><option value="NOT_HAREDI">בגלל שאינו מרקע חרדי</option><option value="OTHER">אחר</option></Select></Field>
          {rej.reason === 'OTHER' && <Field label="פירוט הסיבה" required error={errors.note}><Input value={rej.note} onChange={(e) => setRej({ ...rej, note: e.target.value })} /></Field>}
          <Checkbox label="לשלוח למועמד הודעת דחייה עם הסיבה" checked={rej.sendMessage} onChange={(v) => setRej({ ...rej, sendMessage: v })} />
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>

      <Dialog open={dialog === 'call'} onOpenChange={(o) => !o && !doCall.isPending && close()} title="תיעוד שיחת בירור" wide
        footer={<><Button variant="primary" loading={doCall.isPending} onClick={() => doCall.mutate(undefined)}>שמירה</Button><Button onClick={close} disabled={doCall.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="תאריך השיחה"><Input type="date" className="max-w-56" value={call.date} onChange={(e) => setCall({ ...call, date: e.target.value })} /></Field>
          <Field label="סיכום השיחה" required error={errors.summary}><Textarea className="min-h-24" value={call.summary} onChange={(e) => setCall({ ...call, summary: e.target.value })} /></Field>
          <Field label="תוצאת השיחה"><Select value={call.result} onChange={(e) => setCall({ ...call, result: e.target.value })}><option value="NONE">להמשיך להמתין</option><option value="INVITE_GROUP">הזמנה לראיון קבוצתי</option><option value="REJECT">דחייה</option></Select></Field>
          {call.result === 'REJECT' && <Field label="סיבת הדחייה"><Select value={call.rejectReason} onChange={(e) => setCall({ ...call, rejectReason: e.target.value })}><option value="NOT_HAREDI">בגלל שאינו מרקע חרדי</option><option value="OTHER">אחר (הסיכום ישמש כסיבה)</option></Select></Field>}
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>

      <Dialog open={dialog === 'personal'} onOpenChange={(o) => !o && !personal.isPending && close()} title="הזמנה לפגישה אישית לבירור נוסף" wide
        footer={<><Button variant="primary" loading={personal.isPending} onClick={() => personal.mutate(undefined)}>שלח הזמנה</Button><Button onClick={close} disabled={personal.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">המועמד יקבל הודעה עם המועדים, וקישור לבחירת מועד. יש להציע לפחות מועד אחד.</p>
          {slots.map((s, i) => <div key={i}>{slotInput(s, (v) => setSlots(slots.map((x, j) => (j === i ? v : x))), `מועד ${i + 1}${i === 0 ? ' *' : ''}`)}</div>)}
          {errors.slots && <p role="alert" className="text-xs text-red-700">{errors.slots}</p>}
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>

      <Dialog open={dialog === 'meeting'} onOpenChange={(o) => !o && !meeting.isPending && close()} title="קביעת מועד לפגישה אישית"
        footer={<><Button variant="primary" loading={meeting.isPending} onClick={() => meeting.mutate(undefined)}>שמירה</Button><Button onClick={close} disabled={meeting.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          {slotInput(when, setWhen, 'מועד הפגישה')}
          {errors.scheduledAt && <p role="alert" className="text-xs text-red-700">{errors.scheduledAt}</p>}
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>

      <Dialog open={dialog === 'decision'} onOpenChange={(o) => !o && !decide.isPending && close()} title="החלטה בעקבות הפגישה האישית"
        footer={<><Button variant="primary" loading={decide.isPending} onClick={() => decide.mutate(undefined)}>אישור</Button><Button onClick={close} disabled={decide.isPending}>ביטול</Button></>}>
        <div className="space-y-4">
          <Field label="החלטה"><Select value={dec.decision} onChange={(e) => setDec({ ...dec, decision: e.target.value })}>{Object.entries(meetingDecisionLabel).map(([k, l]) => <option key={k} value={k}>{k === 'NOT_NOW' ? 'כרגע לא מתאים, מוזמן/ת לנסות שוב' : l}</option>)}</Select></Field>
          <Field label="הערה"><Textarea className="min-h-16" value={dec.note} onChange={(e) => setDec({ ...dec, note: e.target.value })} /></Field>
          <Checkbox label="לשלוח למועמד הודעה על ההחלטה" checked={dec.sendMessage} onChange={(v) => setDec({ ...dec, sendMessage: v })} />
          <p className="text-xs text-slate-500">בשלב זה ההודעות לא נשלחות אוטומטית: הרכז מסמן אם לשלוח (לפעמים התשובה כבר נאמרה בפגישה). בקבלה נוצר כרטיס חבר.</p>
          {errors._ && <InlineAlert tone="red">{errors._}</InlineAlert>}
        </div>
      </Dialog>
    </>
  );
}
