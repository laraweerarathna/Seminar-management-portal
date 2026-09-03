import React, { useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Activity, DatabaseBackup, Download, FileSpreadsheet, FileText, History } from 'lucide-react';
import { buildSchoolDirectory } from '../utils/schools';
import PageHeader from './PageHeader';

const status = (seminar) => seminar.status === 'upcoming' ? 'confirmed' : seminar.status || 'draft';
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
const escape = (value) => {
  const text = String(value ?? '');
  const formulaSafeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafeText.replaceAll('"', '""')}"`;
};

export default function Reports() {
  const { seminars, contacts, activities, schoolNotes, dataWindowComplete = true, canCreateBackup = false } = useContext(AppContext);
  const schools = useMemo(() => buildSchoolDirectory({ contacts, seminars, schoolRecords: schoolNotes }), [contacts, seminars, schoolNotes]);
  const stats = useMemo(() => ({ completed: seminars.filter(seminar => status(seminar) === 'completed').length, confirmed: seminars.filter(seminar => status(seminar) === 'confirmed').length, draft: seminars.filter(seminar => status(seminar) === 'draft').length, cancelled: seminars.filter(seminar => status(seminar) === 'cancelled').length }), [seminars]);
  const exportSeminars = () => download(`\uFEFF${[['School', 'Title', 'Status', 'Start date', 'End date', 'Start time', 'End time', 'Student count', 'Grades'].map(escape).join(','), ...seminars.map(item => [item.school, item.title, status(item), item.date1, item.date2, item.startTime, item.endTime, item.studentCount, [item.grade10 && 'Grade 10', item.grade11 && 'Grade 11'].filter(Boolean).join(' / ')].map(escape).join(','))].join('\n')}`, 'horana-seminars.csv', 'text/csv;charset=utf-8');
  const exportContacts = () => download(`\uFEFF${[['School', 'Name', 'Role', 'Phone', 'Primary'].map(escape).join(','), ...schools.flatMap(school => school.people.length ? school.people.map(person => [school.name, person.name, person.role, person.phone, person.primary ? 'Yes' : 'No'].map(escape).join(',')) : [[school.name, '', '', '', ''].map(escape).join(',')])].join('\n')}`, 'horana-school-contacts.csv', 'text/csv;charset=utf-8');
  const exportBackup = () => download(
    JSON.stringify({ exportedAt: new Date().toISOString(), seminars, contacts, schoolNotes, activities }, null, 2),
    `horana-portal-backup-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json',
  );
  return (
    <div className="page reports-page animate-fade-in">
      <PageHeader eyebrow="Insights and continuity" title="Reports and exports" description="Export seminar information and review recent operational changes." />

      <section className="report-stats" aria-label="Seminar status summary">
        <article className="confirmed"><span>Confirmed</span><strong>{stats.confirmed}</strong></article>
        <article className="completed"><span>Completed</span><strong>{stats.completed}</strong></article>
        <article className="draft"><span>Draft</span><strong>{stats.draft}</strong></article>
        <article className="cancelled"><span>Cancelled</span><strong>{stats.cancelled}</strong></article>
      </section>

      <section className="report-grid">
        <article className="report-card">
          <span className="feature-icon"><FileSpreadsheet size={22} /></span>
          <h2>Spreadsheet exports</h2>
          <p>Download seminar history or school contacts as CSV files for Excel or Google Sheets.</p>
          {!dataWindowComplete && <small className="report-data-warning">Load all available record pages before exporting to avoid an incomplete file.</small>}
          <div><button className="btn btn-secondary" disabled={!dataWindowComplete} onClick={exportSeminars}><Download size={16} />Seminars CSV</button><button className="btn btn-secondary" disabled={!dataWindowComplete} onClick={exportContacts}><Download size={16} />Contacts CSV</button></div>
        </article>
        <article className="report-card">
          <span className="feature-icon warm"><FileText size={22} /></span>
          <h2>Printable report</h2>
          <p>Use your browser’s print dialog to save a clean PDF report of this page.</p>
          <button className="btn btn-secondary" onClick={() => window.print()}><FileText size={16} />Print or save PDF</button>
        </article>
        {canCreateBackup && <article className="report-card backup-card">
          <span className="feature-icon"><DatabaseBackup size={22} /></span>
          <h2>Protected full backup</h2>
          <p>Download all loaded operational records in one JSON file.</p>
          {!dataWindowComplete && <small className="report-data-warning">Load all available record pages before creating a full backup.</small>}
          <button className="btn btn-primary" disabled={!dataWindowComplete} onClick={exportBackup}><DatabaseBackup size={16} />Download backup</button>
        </article>}
      </section>

      <section className="activity-panel">
        <div className="panel-heading"><div><span className="eyebrow accent">Activity history</span><h2><History size={20} />Recent changes</h2></div></div>
        {activities.length ? <div>{activities.slice(0, 12).map(activity => <article key={activity.id}><Activity size={16} /><span><strong>{activity.label}</strong><small>{activity.action} by {activity.user || 'Portal user'} · {activity.createdAt?.toDate ? activity.createdAt.toDate().toLocaleString() : 'Just now'}</small></span></article>)}</div> : <p className="no-contacts">New seminar and contact changes will be recorded here.</p>}
      </section>
    </div>
  );
}
