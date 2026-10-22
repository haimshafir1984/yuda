import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import clsx, { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, Loader2, X } from 'lucide-react';
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from 'react';
import { Link } from 'react-router-dom';

const cx = (...c: ClassValue[]) => twMerge(clsx(c));

// ---------- כפתורים ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:text-red-300',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------- טפסים ----------
const controlClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:bg-slate-50 disabled:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { ltr?: boolean }>(function Input(
  { className, ltr, ...rest },
  ref,
) {
  return <input ref={ref} dir={ltr ? 'ltr' : undefined} className={cx(controlClass, ltr && 'text-right', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx(controlClass, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(controlClass, 'min-h-24', className)} {...rest} />;
});

export function Field({ label, error, required, hint, children, className }: { label: string; error?: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ms-0.5 text-red-600" aria-hidden> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="size-4 accent-teal-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------- תצוגה ----------
type Tone = 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'teal';
const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-800',
  blue: 'bg-sky-50 text-sky-800',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-800',
  teal: 'bg-teal-50 text-teal-800',
};
export const Badge = ({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
);

export const Card = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={clsx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>{children}</div>
);

export const Ltr = ({ children }: { children: ReactNode }) => <span className="ltr-text">{children}</span>;

export function Spinner({ label = 'טוען...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-slate-500">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertCircle className="size-8 text-red-500" aria-hidden />
      <p className="text-sm text-slate-700">{error instanceof Error ? error.message : 'אירעה שגיאה בטעינת הנתונים'}</p>
      {onRetry && (
        <Button onClick={onRetry} size="sm">
          נסו שוב
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Inbox className="size-8 text-slate-300" aria-hidden />
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="max-w-sm text-sm text-slate-500">{text}</p>}
      {action}
    </div>
  );
}

export function FutureNotice({ title, text }: { title: string; text: string }) {
  return (
    <Card className="p-10">
      <EmptyState title={title} text={text} />
    </Card>
  );
}

export function InlineAlert({ tone = 'amber', children }: { tone?: 'amber' | 'red' | 'blue' | 'green'; children: ReactNode }) {
  const t = { amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-900', blue: 'border-sky-200 bg-sky-50 text-sky-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={clsx('rounded-md border px-3 py-2 text-sm', t)}>
      {children}
    </div>
  );
}

// ---------- ניווט ----------
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="מיקום במערכת" className="mb-2 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronLeft className="size-3.5" aria-hidden />}
            {it.to ? (
              <Link to={it.to} className="hover:text-teal-700 hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-slate-700">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumbs?: { label: string; to?: string }[] }) {
  return (
    <header className="mb-5">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ---------- טבלה ----------
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
}
export interface SortState {
  sort: string;
  order: 'asc' | 'desc';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  onSort,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSort?: (sortKey: string) => void;
  empty?: ReactNode;
  caption?: string;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-start text-xs font-semibold text-slate-600">
            {columns.map((c) => {
              const active = sort && c.sortKey === sort.sort;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={clsx('px-3 py-2.5 text-start font-semibold', c.className)}
                >
                  {c.sortKey && onSort ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)} className="inline-flex items-center gap-1 hover:text-teal-700">
                      {c.header}
                      {active ? (sort!.order === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />) : <ChevronsUpDown className="size-3.5 text-slate-300" aria-hidden />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={clsx('border-b border-slate-100 last:border-0', onRowClick && 'cursor-pointer hover:bg-teal-50/50 focus-visible:bg-teal-50')}
            >
              {columns.map((c) => (
                <td key={c.key} className={clsx('px-3 py-3 align-middle text-slate-800', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav aria-label="עימוד" className="flex items-center justify-between border-t border-slate-200 px-3 py-2.5 text-sm text-slate-600">
      <span>
        עמוד {page} מתוך {pages} ({total} רשומות)
      </span>
      <div className="flex gap-1">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="העמוד הקודם">
          <ChevronRight className="size-4" aria-hidden /> הקודם
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="העמוד הבא">
          הבא <ChevronLeft className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

// ---------- חלונות קופצים ----------
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <DialogPrimitive.Content
          dir="rtl"
          className={clsx(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-xl',
            wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="text-lg font-bold text-slate-900">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="סגירה">
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="mb-3 text-sm text-slate-600">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          {children}
          {footer && <div className="mt-5 flex flex-wrap justify-start gap-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="primary" className="!bg-red-600 hover:!bg-red-700" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            חזרה
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

// ---------- טאבים ----------
export const Tabs = (props: React.ComponentProps<typeof TabsPrimitive.Root>) => <TabsPrimitive.Root dir="rtl" {...props} />;
export const TabsContent = ({ value, children }: { value: string; children: ReactNode }) => (
  <TabsPrimitive.Content value={value} className="mt-4 focus-visible:outline-none">
    {children}
  </TabsPrimitive.Content>
);
export function TabsList({ tabs }: { tabs: { value: string; label: string; future?: boolean }[] }) {
  return (
    <div className="overflow-y-hidden overflow-x-auto border-b border-slate-200 [scrollbar-width:thin]">
      <TabsPrimitive.List aria-label="אזורי מידע" className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-slate-600 hover:text-teal-700 data-[state=active]:border-teal-600 data-[state=active]:text-teal-700',
              t.future && 'text-slate-400',
            )}
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </div>
  );
}
