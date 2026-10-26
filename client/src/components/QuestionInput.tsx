import type { AnswerInput } from '../lib/types';
import { Field, Textarea } from './ui';

export interface QuestionDef {
  id: number;
  text: string;
  type: 'TEXT' | 'SINGLE_CHOICE' | 'MULTI_CHOICE';
  required: boolean;
  options: { id: number; label: string }[];
}
export interface AnswerValue {
  text: string;
  optionId: number | null;
  optionIds: number[];
}
export const emptyAnswer = (): AnswerValue => ({ text: '', optionId: null, optionIds: [] });

export const isMissing = (q: QuestionDef, a: AnswerValue | undefined): boolean =>
  q.required && (q.type === 'TEXT' ? !a?.text.trim() : q.type === 'SINGLE_CHOICE' ? !a?.optionId : !a?.optionIds.length);

export const toAnswerInput = (q: QuestionDef, a: AnswerValue | undefined): AnswerInput => ({
  questionId: q.id,
  textValue: a?.text ?? '',
  optionId: a?.optionId ?? null,
  optionIds: a?.optionIds ?? [],
});

/** שדה שאלת הרשמה לפי סוגה: טקסט חופשי, כפתורי רדיו או צ'קבוקסים */
export default function QuestionInput({ q, value, onChange, error }: { q: QuestionDef; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void; error?: string }) {
  const v = value ?? emptyAnswer();
  if (q.type === 'TEXT')
    return (
      <Field label={q.text} required={q.required} error={error}>
        <Textarea className="min-h-16" value={v.text} onChange={(e) => onChange({ ...emptyAnswer(), text: e.target.value })} />
      </Field>
    );

  // קבוצת כפתורים: fieldset, כדי שלחיצה על הכותרת לא תסמן אפשרות
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">
        {q.text}
        {q.required && <span className="ms-0.5 text-red-600" aria-hidden> *</span>}
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {q.options.map((o) => (
          <label key={o.id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            {q.type === 'SINGLE_CHOICE' ? (
              <input type="radio" name={`q-${q.id}`} className="size-4 accent-teal-600" checked={v.optionId === o.id} onChange={() => onChange({ ...emptyAnswer(), optionId: o.id })} />
            ) : (
              <input
                type="checkbox"
                className="size-4 accent-teal-600"
                checked={v.optionIds.includes(o.id)}
                onChange={(e) => onChange({ ...emptyAnswer(), optionIds: e.target.checked ? [...v.optionIds, o.id] : v.optionIds.filter((x) => x !== o.id) })}
              />
            )}
            {o.label}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </fieldset>
  );
}
