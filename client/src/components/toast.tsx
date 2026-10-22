import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ReactNode, createContext, useCallback, useContext, useState } from 'react';
import { ApiError } from '../lib/api';

interface Toast {
  id: number;
  type: 'success' | 'error';
  text: string;
}
const ToastContext = createContext<{ push: (type: Toast['type'], text: string) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

let seq = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: Toast['type'], text: string) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 start-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 rounded-md border bg-white px-3 py-2.5 text-sm shadow-lg ${t.type === 'error' ? 'border-red-200 text-red-800' : 'border-emerald-200 text-emerald-800'}`}
          >
            {t.type === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * מוטציה עם הודעות הצלחה/שגיאה. לאחר כל שינוי כל השאילתות מתרעננות,
 * כך שחבר וסדנה תמיד מציגים את אותם נתונים מהשרת (סנכרון דו-כיווני).
 */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void; onError?: (e: ApiError) => void; silentCodes?: string[] } = {},
) {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await qc.invalidateQueries();
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) push('success', msg);
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      const err = e instanceof ApiError ? e : new ApiError(0, 'ERROR', 'אירעה שגיאה. נסו שוב');
      if (!opts.silentCodes?.includes(err.code)) push('error', err.message);
      opts.onError?.(err);
    },
  });
}
