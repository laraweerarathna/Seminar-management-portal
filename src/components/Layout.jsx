import React, { useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, UsersRound, CalendarDays, GraduationCap, Sparkles, BarChart3, Building2, LogIn, LogOut } from 'lucide-react';
import { AppContext } from '../context/AppContext';

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Schedule', icon: CalendarDays },
  { to: '/contacts', label: 'School directory', icon: UsersRound },
  { to: '/schools', label: 'School profiles', icon: Building2 },
  { to: '/reports', label: 'Reports & backup', icon: BarChart3 },
];

export default function Layout() {
  const { user, role, signIn, logOut } = useContext(AppContext);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={24} /></div>
          <div><span className="eyebrow">Coordination desk</span><strong>Horana<br />Subgroup</strong></div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>{React.createElement(Icon, { size: 19, strokeWidth: 2 })}<span>{label}</span></NavLink>
          ))}
        </nav>
        <div className="sidebar-note"><Sparkles size={18} /><p>Keep every school visit, contact, and follow-up in one place.</p></div>
        <div className="account-card">
          {user ? <><div className="account-avatar">{(user.displayName || user.email || '?').slice(0, 1)}</div><div><strong>{user.displayName || 'Signed-in user'}</strong><span>{role}</span></div><button onClick={logOut} title="Sign out"><LogOut size={16} /></button></> : <button className="sign-in-button" onClick={signIn}><LogIn size={16} />Sign in with Google</button>}
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  );
}
