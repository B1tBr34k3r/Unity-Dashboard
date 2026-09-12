import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, List, Wallet, Settings, LogOut, Menu, X, Calendar, Smartphone } from 'lucide-react';
import { createElement, useState } from 'react';

const primaryLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/licenses', icon: List, label: 'Licenses' },
  { to: '/payouts', icon: Wallet, label: 'Payout Wallets' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const insightLinks = [
  { to: '/phone-earnings', icon: Smartphone, label: 'Phone Earnings' },
  { to: '/daily-changes', icon: Calendar, label: 'Daily Changes' },
];

export default function Sidebar({ api }) {
  const [open, setOpen] = useState(false);

  const renderLink = ({ to, icon, label }) => (
    <NavLink
      key={to}
      to={to}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-accent/15 to-accent-cyan/10 text-white border border-white/[0.08] shadow-sm shadow-accent/10'
            : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
        }`
      }
      end
    >
      {createElement(icon, { size: 17, strokeWidth: 1.8 })}
      {label}
    </NavLink>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-white/70 hover:text-white hover:bg-white/[0.1]"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed z-40 top-0 left-0 h-screen w-60 flex flex-col transition-transform duration-300 ease-out overflow-y-auto ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          background: 'linear-gradient(180deg, rgba(15,15,35,0.98) 0%, rgba(10,10,26,0.99) 100%)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Logo */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3">
            <img src="/unity-icon.png" alt="Unity" className="w-9 h-9 rounded-xl shadow-lg shadow-accent/25" />
            <div>
              <span className="text-gradient text-sm font-bold block leading-tight">Unity Nodes</span>
              <span className="text-[10px] text-white/25">Dashboard</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        {/* Navigation */}
        <nav className="flex-1 p-3 pt-4 space-y-4">
          <div className="space-y-1">
            {primaryLinks.map(renderLink)}
          </div>
          <div className="pt-2">
            <p className="px-4 mb-2 text-[10px] uppercase tracking-[0.22em] text-white/22">Insights</p>
            <div className="space-y-1">
              {insightLinks.map(renderLink)}
            </div>
          </div>
        </nav>

        {/* Divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        {/* User + Logout */}
        <div className="p-4">
          {api?.user?.email && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-white/[0.02]">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent/30 to-accent-cyan/20 flex items-center justify-center text-[10px] text-white/60 font-medium">
                {api.user.email[0].toUpperCase()}
              </div>
              <p className="text-[11px] text-white/35 truncate flex-1">{api.user.email}</p>
            </div>
          )}
          <button
            onClick={api?.logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs text-white/30 hover:bg-white/[0.04] hover:text-danger/70 transition-all"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
