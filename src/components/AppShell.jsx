import { useState } from "react";
import { NavLink } from "react-router-dom";

function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/**
 * Responsive shell used by the School Admin, Teacher, and Super Admin areas.
 * Desktop (md+): fixed left sidebar.
 * Mobile: top bar with a hamburger button that opens a slide-over drawer.
 */
export default function AppShell({ eyebrow, title, subtitle, navItems, onLogout, children }) {
  const [open, setOpen] = useState(false);

  const NavList = ({ onNavigate }) => (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              isActive ? "bg-brand-600 text-white shadow-soft" : "text-slate-600 hover:bg-slate-100"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 bg-white px-4 py-6">
        <div className="px-2 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>
          <h1 className="font-display font-bold text-slate-900 text-lg leading-tight mt-0.5">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
        {onLogout && (
          <button onClick={onLogout} className="btn-ghost justify-start mt-4">
            <LogoutIcon className="h-4 w-4" />
            Sign out
          </button>
        )}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <button className="btn-icon -ml-2" onClick={() => setOpen(true)} aria-label="Open menu">
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 leading-none">{eyebrow}</p>
          <h1 className="font-display font-bold text-slate-900 text-sm leading-tight mt-0.5">{title}</h1>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-lifted p-5 flex flex-col animate-slide-up safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>
                <h2 className="font-display font-bold text-slate-900 text-base leading-tight">{title}</h2>
                {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
              </div>
              <button className="btn-icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            {onLogout && (
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="btn-ghost justify-start mt-4"
              >
                <LogoutIcon className="h-4 w-4" />
                Sign out
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-64 min-w-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
