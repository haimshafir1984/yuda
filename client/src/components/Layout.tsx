import clsx from 'clsx';
import { CalendarDays, Menu, Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const NAV = [
  { to: '/members', label: 'חברים', icon: Users },
  { to: '/workshops', label: 'סדנאות ואירועים', icon: CalendarDays },
  { to: '/settings', label: 'הגדרות', icon: Settings },
];

const readCollapsed = () => {
  try {
    return localStorage.getItem('sidebarCollapsed') === '1';
  } catch {
    return false;
  }
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const toggle = () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      const next = !collapsed;
      setCollapsed(next);
      try {
        localStorage.setItem('sidebarCollapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
    } else setMobileOpen((o) => !o);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">
        דילוג לתוכן
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button
          type="button"
          onClick={toggle}
          aria-label="פתיחה או סגירה של תפריט הצד"
          aria-expanded={mobileOpen || !collapsed}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-teal-600 text-sm font-bold text-white" aria-hidden>
            י
          </span>
          <span className="text-lg font-bold text-slate-900">החצר של יודה</span>
        </div>
      </header>

      <div className="relative flex flex-1">
        {mobileOpen && <div className="fixed inset-0 top-14 z-20 bg-slate-900/30 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}
        <aside
          className={clsx(
            'fixed bottom-0 top-14 z-20 w-60 shrink-0 border-e border-slate-200 bg-white p-2 transition-[width] md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:self-start',
            mobileOpen ? 'block' : 'hidden md:block',
            collapsed ? 'md:w-16' : 'md:w-60',
          )}
        >
          <nav aria-label="תפריט ראשי" className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium',
                    isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100',
                    collapsed && 'md:justify-center md:px-0',
                  )
                }
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className={clsx(collapsed && 'md:sr-only')}>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main id="main" className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
