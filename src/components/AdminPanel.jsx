import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Activity, DatabaseBackup, Eye, History, Pencil, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import UserAccess from './UserAccess';
import PageHeader from './PageHeader';

const download = (content, filename, type) => {
  const objectUrl = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};

const roles = [
  { name: 'Viewer', icon: Eye, description: 'Can view portal records and reports.' },
  { name: 'Editor', icon: Pencil, description: 'Can also create and update operational records.' },
  { name: 'Co-Admin', icon: Trash2, description: 'Can also delete records and download full backups, but cannot manage users.' },
  { name: 'Admin', icon: ShieldCheck, description: 'Has full access, including roles, blocking, and removing blocked users.' },
];

export default function AdminPanel() {
  const { seminars, contacts, activities, schoolNotes, userProfiles, dataWindowComplete = true } = useContext(AppContext);
  const [adminActivities, setAdminActivities] = useState([]);
  const [auditError, setAuditError] = useState('');
  const stats = useMemo(() => ({
    blocked: userProfiles.filter(profile => !profile.approved).length,
    active: userProfiles.filter(profile => profile.approved).length,
    admins: userProfiles.filter(profile => profile.approved && profile.role === 'admin').length,
  }), [userProfiles]);

  useEffect(() => onSnapshot(
    query(collection(db, 'adminActivities'), orderBy('createdAt', 'desc'), limit(50)),
    snapshot => {
      setAuditError('');
      setAdminActivities(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    },
    error => {
      console.error('Unable to load the administrator audit:', error);
      setAuditError('Administrator activity could not be loaded.');
    },
  ), []);

  const backup = () => download(
    JSON.stringify({ exportedAt: new Date().toISOString(), seminars, contacts, schoolNotes, activities }, null, 2),
    `horana-portal-backup-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json',
  );

  return (
    <div className="page admin-page animate-fade-in">
      <PageHeader className="admin-page-header" eyebrow="Restricted workspace" title="Admin control" description="Manage account access, roles, removed users, protected backups, and administrator activity from one place.">
        <span className="admin-only-mark"><ShieldCheck size={18} />Admins only</span>
      </PageHeader>

      <section className="admin-summary-grid" aria-label="Account summary">
        <article><UsersRound size={19} /><span>Blocked accounts</span><strong>{stats.blocked}</strong></article>
        <article><ShieldCheck size={19} /><span>Active accounts</span><strong>{stats.active}</strong></article>
        <article><ShieldCheck size={19} /><span>Administrators</span><strong>{stats.admins}</strong></article>
      </section>

      <UserAccess />

      <section className="admin-tools-grid">
        <article className="admin-card backup-card">
          <span className="feature-icon"><DatabaseBackup size={22} /></span>
          <h2>Protected full backup</h2>
          <p>Download seminars, contacts, school notes, and operational activity in one JSON file.</p>
          {!dataWindowComplete && <small className="report-data-warning">Load every available record page before creating a full backup.</small>}
          <button className="btn btn-primary" disabled={!dataWindowComplete} onClick={backup}><DatabaseBackup size={16} />Download backup</button>
        </article>
        <article className="admin-card">
          <span className="feature-icon warm"><ShieldCheck size={22} /></span>
          <h2>Role permissions</h2>
          <div className="admin-role-list">
            {roles.map(({ name, icon: Icon, description }) => <div key={name}>{React.createElement(Icon, { size: 16 })}<span><strong>{name}</strong><small>{description}</small></span></div>)}
          </div>
        </article>
      </section>

      <section className="activity-panel admin-audit-panel">
        <div><span className="eyebrow accent">Administrators only</span><h2><History size={20} />Access audit</h2></div>
        {auditError && <p className="access-feedback error" role="alert">{auditError}</p>}
        {!auditError && (adminActivities.length ? <div>{adminActivities.slice(0, 12).map(activity => <article key={activity.id}><Activity size={16} /><span><strong>{activity.label}</strong><small>{activity.action} by {activity.user || 'Portal administrator'} · {activity.createdAt?.toDate ? activity.createdAt.toDate().toLocaleString() : 'Just now'}</small></span></article>)}</div> : <p className="no-contacts">Block, unblock, removal, and role changes will appear here.</p>)}
      </section>
    </div>
  );
}
