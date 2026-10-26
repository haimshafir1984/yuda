import { kindLabel2 } from '../lib/format';

/** בחירה מרובה של מהות הליווי (מקבצת תיבות סימון נגישות) */
export default function KindsField({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">מהות הליווי <span className="text-red-600" aria-hidden>*</span></legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {Object.entries(kindLabel2).map(([k, l]) => (
          <label key={k} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-teal-600" checked={value.includes(k)} onChange={() => toggle(k)} />
            {l}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </fieldset>
  );
}
