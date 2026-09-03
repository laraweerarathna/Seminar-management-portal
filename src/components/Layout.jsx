import React, { Suspense, useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AlertTriangle, BarChart3, Building2, CalendarDays, Database, GraduationCap, LayoutDashboard, LoaderCircle, LogIn, LogOut, ShieldAlert, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import ToastRegion from './ToastRegion';
import horanaLogo from '../../Logo.svg';

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Schedule', icon: CalendarDays },
  { to: '/contacts', label: 'School directory', icon: UsersRound },
  { to: '/schools', label: 'School profiles', icon: Building2 },
  { to: '/reports', label: 'Reports & exports', icon: BarChart3 },
];
const roleLabels = { viewer: 'Viewer', editor: 'Editor', co_admin: 'Co-Admin', admin: 'Admin' };

export default function Layout() {
  const { user, role, approved, authReady, dataLoading, dataError, signingIn, userProfiles, hasMoreData = {}, loadingMoreData, notices = [], signIn, logOut, loadMoreData, dismissNotice } = useContext(AppContext);
  const blockedUsers = userProfiles.filter(profile => !profile.approved).length;
  const moreDataNames = Object.entries(hasMoreData).filter(([, hasMore]) => hasMore).map(([name]) => name);
  const portalContent = !authReady ? (
    <section className="portal-state" aria-live="polite"><LoaderCircle className="spin" size={30} /><h1>Preparing the portal</h1><p>Checking your account…</p></section>
  ) : !user ? (
    <section className="portal-state"><GraduationCap size={34} /><h1>Welcome to the seminar portal</h1><p>Sign in with your authorized Google account to view and manage seminar information.</p><button className="btn btn-primary" disabled={signingIn} onClick={signIn}><LogIn size={17} />{signingIn ? 'Signing in…' : 'Sign in with Google'}</button></section>
  ) : dataError ? (
    <section className="portal-state error" role="alert"><AlertTriangle size={32} /><h1>We couldn’t load the portal</h1><p>{dataError}</p><button className="btn btn-secondary" onClick={() => window.location.reload()}>Try again</button></section>
  ) : !approved ? (
    <section className="portal-state blocked-access" role="status"><ShieldAlert size={34} /><h1>Access blocked</h1><p><strong>{user.email}</strong> is signed in, but an administrator has blocked this account from viewing portal data.</p><button className="btn btn-secondary" onClick={logOut}><LogOut size={17} />Sign out</button></section>
  ) : (
    <Suspense fallback={<section className="portal-state" aria-live="polite"><LoaderCircle className="spin" size={30} /><h1>Loading this page</h1><p>Preparing the selected section…</p></section>}>
      <Outlet />
    </Suspense>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><img src={horanaLogo} alt="" /></div>
          <div className="brand-copy"><strong>Horana<br />Sub Group</strong></div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {approved && links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>{React.createElement(Icon, { size: 19, strokeWidth: 2 })}<span>{label}</span></NavLink>
          ))}
          {approved && role === 'admin' && <NavLink to="/admin" className={({ isActive }) => `nav-link admin-nav-link ${isActive ? 'active' : ''}`}><ShieldCheck size={19} strokeWidth={2} /><span>Admin control</span>{blockedUsers > 0 && <em className="nav-pending-count" aria-label={`${blockedUsers} blocked account${blockedUsers === 1 ? '' : 's'}`}>{blockedUsers}</em>}</NavLink>}
        </nav>
        <button className="mobile-account-button" disabled={!user && signingIn} onClick={user ? logOut : signIn} title={user ? 'Sign out' : 'Sign in'} aria-label={user ? 'Sign out' : 'Sign in with Google'}>
          {user ? <LogOut size={17} /> : <LogIn size={17} />}
        </button>
        <div className="sidebar-note"><Sparkles size={18} /><p>Keep every school visit, contact, and follow-up in one place.</p></div>
        <div className="account-card">
          {user ? <><div className="account-avatar">{(user.displayName || user.email || '?').slice(0, 1)}</div><div><strong>{user.displayName || 'Signed-in user'}</strong><span>{approved ? roleLabels[role] || 'Viewer' : 'Blocked'}</span></div><button onClick={logOut} title="Sign out"><LogOut size={16} /></button></> : <button className="sign-in-button" disabled={signingIn} onClick={signIn}><LogIn size={16} />{signingIn ? 'Signing in…' : 'Sign in with Google'}</button>}
        </div>
      </aside>
      <main className="main-content" aria-busy={approved && dataLoading}>
        {approved && dataLoading && !dataError && <aside className="data-sync-notice" role="status" aria-live="polite"><LoaderCircle className="spin" size={18} /><p><strong>Syncing the latest records</strong><span>You can use the portal while the seminar and school data finishes loading.</span></p></aside>}
        {approved && !dataLoading && !dataError && moreDataNames.length > 0 && <aside className="data-window-notice" aria-label="Additional records available"><Database size={18} /><p><strong>More records are available.</strong><span>The initial view is capped for faster loading. Load the next page of {moreDataNames.join(', ')}; editing and complete exports resume after every page is loaded.</span></p><button type="button" className="btn btn-secondary" onClick={loadMoreData} disabled={loadingMoreData}>{loadingMoreData ? 'Loading…' : 'Load more records'}</button></aside>}
        {portalContent}
      </main>
      <ToastRegion notices={notices} onDismiss={dismissNotice} />
    </div>
  );
}
