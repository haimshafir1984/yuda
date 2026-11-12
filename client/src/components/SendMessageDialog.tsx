import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { MessageTemplateRow } from '../lib/types';
import { useAction } from './toast';
import { Button, Dialog, Field, Input, InlineAlert, Select, Textarea } from './ui';

interface SendResult {
  sent: number;
  skipped: number;
  results: { memberId: number; memberName: string; status: string; error: string | null }[];
}

/** משתנים שהמערכת ממלאת לבד לכל חבר */
const AUTO_VARS = ['שם', 'שם מלא'];
const varsOf = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))].filter((v) => !AUTO_VARS.includes(v));

/**
 * שליחת הודעה ידנית לחבר אחד או לכמה חברים: לפי תבנית (עם מילוי המשתנים), או בנוסח חופשי.
 * ההודעה יוצאת בערוץ המועדף של כל חבר. בהדגמה היא נשמרת בתיבת היוצאות ולא נשלחת בפועל.
 */
export default function SendMessageDialog({
  open,
  onClose,
  memberIds,
  recipientLabel,
  related,
  presetVars,
}: {
  open: boolean;
  onClose: () => void;
  memberIds: number[];
  recipientLabel: string;
  related?: { type: string; id: number };
  presetVars?: Record<string, string>;
}) {
  const tpls = useQuery({ queryKey: ['msg-send-options'], queryFn: () => api.get<MessageTemplateRow[]>('/messages/send-options'), enabled: open });
  const [choice, setChoice] = useState(''); // מפתח תבנית, או "free"
  const [body, setBody] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);

  const tpl = tpls.data?.find((t) => t.key === choice) ?? null;
  const needed = useMemo(() => (tpl ? varsOf(`${tpl.subject ?? ''} ${tpl.body}`) : []), [tpl]);
  const valueOf = (v: string) => vars[v] ?? presetVars?.[v] ?? '';

  const send = useAction(
    () =>
      api.post<SendResult>('/messages/send', {
        memberIds,
        ...(tpl ? { templateKey: tpl.key } : { body }),
        vars: Object.fromEntries(needed.map((v) => [v, valueOf(v)])),
        related,
      }),
    { onSuccess: (r) => setResult(r), silentCodes: ['VALIDATION'], onError: (e) => setError(e.fields.body ?? e.message) },
  );

  const close = () => {
    onClose();
    setChoice('');
    setBody('');
    setVars({});
    setError('');
    setResult(null);
  };
  const submit = () => {
    if (!choice) return setError('יש לבחור תבנית או לכתוב הודעה חופשית');
    if (!tpl && !body.trim()) return setError('יש לכתוב את נוסח ההודעה');
    const missing = needed.filter((v) => !valueOf(v).trim());
    if (missing.length) return setError(`יש למלא: ${missing.join(', ')}`);
    setError('');
    send.mutate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !send.isPending && close()}
      title="שליחת הודעה"
      description={`נמענים: ${recipientLabel}`}
      wide
      footer={
        result ? (
          <Button variant="primary" onClick={close}>סגירה</Button>
        ) : (
          <>
            <Button variant="primary" loading={send.isPending} onClick={submit}>שליחה</Button>
            <Button onClick={close} disabled={send.isPending}>ביטול</Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <InlineAlert tone={result.skipped ? 'amber' : 'green'}>
            <span className="block">נשלחו {result.sent} הודעות{result.skipped ? `, ${result.skipped} לא נשלחו` : ''}. ההודעות מופיעות בתיבת היוצאות (הגדרות). בהדגמה אין שליחה אמיתית.</span>
          </InlineAlert>
          {result.results.filter((r) => r.status !== 'SENT').map((r) => (
            <p key={r.memberId} className="text-sm text-slate-700">{r.memberName}: {r.error ?? r.status}</p>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="תבנית">
            <Select value={choice} onChange={(e) => { setChoice(e.target.value); setError(''); }}>
              <option value="">בחירת תבנית או הודעה חופשית</option>
              {(tpls.data ?? []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              <option value="free">הודעה חופשית (בלי תבנית)</option>
            </Select>
          </Field>
          {tpl && (
            <>
              <p className="whitespace-pre-line rounded-md bg-slate-50 p-3 text-sm text-slate-700">{tpl.body}</p>
              {needed.map((v) => (
                <Field key={v} label={v} required>
                  <Input value={valueOf(v)} onChange={(e) => { setVars({ ...vars, [v]: e.target.value }); setError(''); }} />
                </Field>
              ))}
              <p className="text-xs text-slate-500">השם של כל חבר מוזן אוטומטית. כל הודעה יוצאת בערוץ המועדף של החבר (SMS כברירת מחדל).</p>
            </>
          )}
          {choice === 'free' && (
            <Field label="נוסח ההודעה" hint="אפשר להשתמש ב-{{שם}} כדי להוסיף את שם החבר" required>
              <Textarea className="min-h-28" maxLength={1000} value={body} onChange={(e) => { setBody(e.target.value); setError(''); }} />
            </Field>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
