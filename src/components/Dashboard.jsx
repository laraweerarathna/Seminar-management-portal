import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { CalendarDays, CheckCircle2, Clock3, Edit3, Image, Link, ListTodo, MapPin, Phone, Plus, Search, UsersRound, X } from 'lucide-react';
import { format, isSameMonth, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../config/firestore';
import { buildSchoolDirectory, normalizeSchoolName } from '../utils/schools';
import { formatPhoneNumber, phoneLink } from '../utils/phone';
import PageHeader from './PageHeader';

const timeLabel = (time) => {
  if (!time) return '';
  const [hour, minute] = time.split(':'); const date = new Date();
  date.setHours(Number(hour), Number(minute));
  return format(date, 'h:mm a');
};
const dateLabel = (seminar) => {
  if (!seminar.date1) return 'Date to be confirmed';
  const first = parseISO(seminar.date1); let label = format(first, 'EEE, MMM d');
  if (seminar.date2) { const second = parseISO(seminar.date2); label += isSameMonth(first, second) ? ` – ${format(second, 'd, yyyy')}` : ` – ${format(second, 'MMM d, yyyy')}`; }
  else label += `, ${format(first, 'yyyy')}`;
  return label;
};
const workflowStatus = (seminar) => seminar.status === 'upcoming' ? 'confirmed' : seminar.status || 'draft';
const statusLabel = (seminar) => ({ draft: 'Draft', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }[workflowStatus(seminar)]);
const emptyOutcomes = { attendance: '', notes: '', photoLinks: [], followUps: [] };
const MAX_OUTCOME_ITEMS = 5;
const outcomesOf = (seminar) => ({ ...emptyOutcomes, ...(seminar.outcomes || {}), photoLinks: seminar.outcomes?.photoLinks || [], followUps: seminar.outcomes?.followUps || [] });
const byUpcomingDate = (first, second) => {
  if (!first.date1 && !second.date1) return 0;
  if (!first.date1) return 1;
  if (!second.date1) return -1;
  return first.date1.localeCompare(second.date1);
};
const isHttpUrl = (value) => {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export default function Dashboard() {
  const { seminars, contacts, schoolNotes, user, canEdit, notify } = useContext(AppContext);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [detailSeminar, setDetailSeminar] = useState(null);
  const [view, setView] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const blank = { title: 'Seminar Program', schoolId: '', school: '', date1: '', date2: '', startTime: '07:30', endTime: '15:00', status: 'draft', grade10: true, grade11: true, locationLink: '', studentCount: '', outcomes: emptyOutcomes };
  const [formData, setFormData] = useState(blank);
  const schools = useMemo(() => buildSchoolDirectory({ contacts, seminars, schoolRecords: schoolNotes }), [contacts, seminars, schoolNotes]);
  const upcoming = useMemo(() => seminars.filter(s => ['draft', 'confirmed'].includes(workflowStatus(s))).sort(byUpcomingDate), [seminars]);
  const completed = useMemo(() => seminars.filter(s => workflowStatus(s) === 'completed').sort((a, b) => (b.date1 || '').localeCompare(a.date1 || '')), [seminars]);
  const cancelled = useMemo(() => seminars.filter(s => workflowStatus(s) === 'cancelled').sort((a, b) => (b.date1 || '').localeCompare(a.date1 || '')), [seminars]);
  const listForView = view === 'upcoming' ? upcoming : view === 'cancelled' ? cancelled : completed;
  const visible = listForView.filter(s => `${s.school} ${s.title}`.toLowerCase().includes(search.toLowerCase())).filter(s => statusFilter === 'all' || workflowStatus(s) === statusFilter).filter(s => schoolFilter === 'all' || s.school === schoolFilter).filter(s => monthFilter === 'all' || s.date1?.slice(0, 7) === monthFilter).filter(s => gradeFilter === 'all' || (gradeFilter === 'grade10' ? s.grade10 : s.grade11));
  const studentTotal = upcoming.reduce((sum, s) => sum + Number(s.studentCount || s.details?.match(/\d+/)?.[0] || 0), 0);
  const detailContacts = useMemo(() => {
    if (!detailSeminar) return [];
    const school = schools.find(item => (
      (detailSeminar.schoolId && item.schoolId && String(detailSeminar.schoolId) === String(item.schoolId))
      || normalizeSchoolName(item.name) === normalizeSchoolName(detailSeminar.school)
    ));
    return school?.people || [];
  }, [schools, detailSeminar]);
  const formSchoolKey = schools.find(school => (
    (formData.schoolId && school.schoolId && String(formData.schoolId) === String(school.schoolId))
    || normalizeSchoolName(school.name) === normalizeSchoolName(formData.school)
  ))?.key || '';
  const openModal = (seminar) => { setEditingId(seminar?.id || null); setFormErrors({}); setFormData(seminar ? { ...blank, ...seminar, outcomes: outcomesOf(seminar) } : { ...blank, outcomes: { ...emptyOutcomes } }); setModalOpen(true); };
  const updateOutcomes = (changes) => {
    const outcomes = { ...outcomesOf(formData), ...changes };
    if (outcomes.photoLinks.length > MAX_OUTCOME_ITEMS || outcomes.followUps.length > MAX_OUTCOME_ITEMS) {
      setFormErrors(current => ({ ...current, general: `You can add up to ${MAX_OUTCOME_ITEMS} photo links and ${MAX_OUTCOME_ITEMS} follow-up tasks.` }));
      return;
    }
    setFormData({ ...formData, outcomes });
    setFormErrors(current => ({ ...current, general: '' }));
  };
  const updateFollowUp = (index, changes) => updateOutcomes({ followUps: outcomesOf(formData).followUps.map((task, taskIndex) => taskIndex === index ? { ...task, ...changes } : task) });
  const reminders = useMemo(() => upcoming.flatMap(seminar => {
    const issues = [];
    const daysAway = seminar.date1 ? differenceInCalendarDays(parseISO(seminar.date1), startOfDay(new Date())) : null;
    if (workflowStatus(seminar) === 'confirmed' && daysAway >= 0 && daysAway <= 7) issues.push({ type: 'due', text: `Due in ${daysAway === 0 ? 'today' : `${daysAway} day${daysAway === 1 ? '' : 's'}`}` });
    if (!seminar.locationLink) issues.push({ type: 'missing', text: 'Map link missing' });
    if (!seminar.studentCount) issues.push({ type: 'missing', text: 'Student count missing' });
    const school = schools.find(item => (
      (seminar.schoolId && item.schoolId && String(seminar.schoolId) === String(item.schoolId))
      || normalizeSchoolName(item.name) === normalizeSchoolName(seminar.school)
    ));
    if (!school?.people.length) issues.push({ type: 'missing', text: 'School contact missing' });
    return issues.map(issue => ({ ...issue, seminar }));
  }), [upcoming, schools]);
  const save = async (event) => {
    event.preventDefault();
    if (!canEdit || saving) return;

    const title = formData.title.trim();
    const selectedSchool = schools.find(school => school.key === formSchoolKey);
    const validationErrors = {};
    if (!title) validationErrors.title = 'Enter a session title.';
    else if (title.length > 200) validationErrors.title = 'Keep the session title under 200 characters.';
    if (!selectedSchool) validationErrors.school = 'Select a school.';
    if (!formData.date1) validationErrors.date1 = 'Select a start date.';
    if (formData.date2 && formData.date1 && formData.date2 < formData.date1) validationErrors.date2 = 'The second date cannot be earlier than the start date.';
    if (!formData.startTime) validationErrors.startTime = 'Select a start time.';
    if (!formData.endTime) validationErrors.endTime = 'Select an end time.';
    else if (formData.startTime && formData.endTime <= formData.startTime) validationErrors.endTime = 'The end time must be later than the start time.';
    if (formData.studentCount !== '' && (!/^\d{1,6}$/.test(String(formData.studentCount)))) validationErrors.studentCount = 'Enter a whole number from 0 to 999999.';
    if (!isHttpUrl(formData.locationLink) || String(formData.locationLink || '').length > 2048) validationErrors.locationLink = 'Enter a valid http or https map link.';
    if (!formData.grade10 && !formData.grade11) validationErrors.grades = 'Select at least one grade.';
    if (workflowStatus(formData) === 'completed') {
      const outcomes = outcomesOf(formData);
      if (outcomes.attendance !== '' && (!/^\d{1,6}$/.test(String(outcomes.attendance)))) validationErrors.attendance = 'Enter a whole number from 0 to 999999.';
      if (outcomes.notes.length > 10000) validationErrors.general = 'Keep outcome notes under 10,000 characters.';
      if (outcomes.photoLinks.length > MAX_OUTCOME_ITEMS) validationErrors.general = `Add no more than ${MAX_OUTCOME_ITEMS} photo links.`;
      if (outcomes.followUps.length > MAX_OUTCOME_ITEMS) validationErrors.general = `Add no more than ${MAX_OUTCOME_ITEMS} follow-up tasks.`;
      outcomes.photoLinks.forEach((link, index) => {
        if (!isHttpUrl(link) || String(link).length > 2048) validationErrors[`photo-${index}`] = 'Enter a valid http or https link.';
      });
      outcomes.followUps.forEach((task, index) => {
        if (String(task.text || '').trim().length > 500) validationErrors.general = `Keep follow-up ${index + 1} under 500 characters.`;
      });
    }
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }

    const id = editingId ? String(editingId) : doc(collection(db, 'seminars')).id;
    const schoolId = selectedSchool.schoolId || doc(collection(db, 'schools')).id;
    const matchingLegacyContacts = contacts.filter(contact => (
      !contact.schoolId && normalizeSchoolName(contact.schoolName) === normalizeSchoolName(selectedSchool.name)
    ));
    if (matchingLegacyContacts.length + 3 > 490) {
      setFormErrors({ general: 'This school has too many contact records to update safely in one operation.' });
      return;
    }

    setFormErrors({});
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const status = formData.status === 'upcoming' ? 'confirmed' : formData.status;
      const outcomes = outcomesOf(formData);
      const updatedBy = user?.displayName || user?.email || 'Portal user';
      batch.set(doc(db, 'schools', schoolId), {
        schoolId,
        name: selectedSchool.name,
        archived: false,
        updatedAt: serverTimestamp(),
        updatedBy,
        updatedByUid: user.uid,
      }, { merge: true });
      matchingLegacyContacts.forEach(contact => batch.set(doc(db, 'contacts', String(contact.id)), {
        schoolId,
        schoolName: selectedSchool.name,
        updatedAt: serverTimestamp(),
        updatedBy,
        updatedByUid: user.uid,
      }, { merge: true }));
      batch.set(doc(db, 'seminars', id), {
        ...formData,
        title,
        schoolId,
        school: selectedSchool.name,
        outcomes: {
          ...outcomes,
          photoLinks: outcomes.photoLinks.map(link => link.trim()).filter(Boolean),
          followUps: outcomes.followUps.filter(task => task.text?.trim()).map(task => ({ ...task, text: task.text.trim() })),
        },
        status,
        id,
        updatedAt: serverTimestamp(),
        updatedBy,
        updatedByUid: user.uid,
      }, { merge: true });
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        entityType: 'seminar',
        entityId: id,
        action: editingId ? 'updated' : 'created',
        label: `${selectedSchool.name} — ${title}`,
        createdAt: serverTimestamp(),
        user: updatedBy,
        userUid: user.uid,
      });
      await batch.commit();
      setModalOpen(false);
      notify(`Seminar ${editingId ? 'updated' : 'created'} successfully.`);
    } catch (error) {
      console.error('Unable to save seminar:', error);
      setFormErrors({ general: 'The seminar could not be saved. Check your permissions and connection, then try again.' });
    } finally {
      setSaving(false);
    }
  };

  return <div className="page dashboard-page animate-fade-in">
    <PageHeader eyebrow="Seminar management" title="Make every school visit count." description="Plan upcoming sessions and keep a clear record of the work already delivered.">{canEdit && <button className="btn btn-primary" onClick={() => openModal()}><Plus size={18} />Add seminar</button>}</PageHeader>
    <section className="summary-grid">
      <div className="metric-card metric-primary"><span className="metric-icon"><Clock3 size={21} /></span><div><span>Planned seminars</span><strong>{upcoming.length}</strong><small>Draft and confirmed</small></div></div>
      <div className="metric-card metric-success"><span className="metric-icon"><CheckCircle2 size={21} /></span><div><span>Past seminars</span><strong>{completed.length}</strong><small>Completed sessions</small></div></div>
      <div className="metric-card metric-warm"><span className="metric-icon"><UsersRound size={21} /></span><div><span>Students expected</span><strong>{studentTotal || '—'}</strong><small>Across upcoming sessions</small></div></div>
    </section>
    {reminders.length > 0 && <section className="reminders-card"><div><span className="eyebrow accent">Needs attention</span><h2>Seminar reminders</h2></div><div className="reminders-list">{reminders.slice(0, 6).map((reminder, index) => <button key={`${reminder.seminar.id}-${reminder.text}-${index}`} onClick={() => setDetailSeminar(reminder.seminar)} className={`reminder-item ${reminder.type}`}><span>{reminder.text}</span><strong>{reminder.seminar.school}</strong></button>)}</div></section>}
    <section className="next-up-card"><div className="next-up-heading"><div><span className="eyebrow accent">Next on the calendar</span><h2>{upcoming[0]?.school || 'No upcoming seminar yet'}</h2>{upcoming[0] && <p><CalendarDays size={16} />{dateLabel(upcoming[0])} · {timeLabel(upcoming[0].startTime)} – {timeLabel(upcoming[0].endTime)}</p>}</div>{upcoming[0] && <button className="btn btn-light" onClick={() => setDetailSeminar(upcoming[0])}>View details</button>}</div></section>
    <section className="content-section"><div className="section-toolbar"><div><div className="tab-group"><button className={view === 'upcoming' ? 'active' : ''} onClick={() => setView('upcoming')}>Planned <span>{upcoming.length}</span></button><button className={view === 'completed' ? 'active' : ''} onClick={() => setView('completed')}>Past <span>{completed.length}</span></button><button className={view === 'cancelled' ? 'active' : ''} onClick={() => setView('cancelled')}>Cancelled <span>{cancelled.length}</span></button></div><h2>{view === 'upcoming' ? 'Planned seminars' : view === 'cancelled' ? 'Cancelled seminars' : 'Past seminars'}</h2></div><label className="search-field"><Search size={17} /><span className="sr-only">Search seminars by school</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a school" /></label></div><div className="filter-bar"><select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><select aria-label="Filter by school" value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}><option value="all">All schools</option>{schools.map(school => <option key={school.key} value={school.name}>{school.name}</option>)}</select><select aria-label="Filter by month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}><option value="all">All months</option>{[...new Set(seminars.map(s => s.date1?.slice(0, 7)).filter(Boolean))].sort().map(month => <option key={month} value={month}>{format(parseISO(`${month}-01`), 'MMMM yyyy')}</option>)}</select><select aria-label="Filter by grade" value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}><option value="all">All grades</option><option value="grade10">Grade 10</option><option value="grade11">Grade 11</option></select></div>
      <div className="seminar-list">{visible.length ? visible.map(seminar => <article className="seminar-row" key={seminar.id}><div className="date-block"><span>{seminar.date1 ? format(parseISO(seminar.date1), 'MMM') : 'TBC'}</span><strong>{seminar.date1 ? format(parseISO(seminar.date1), 'dd') : '—'}</strong></div><div className="seminar-info"><div className="seminar-title"><h3>{seminar.school}</h3><span className={`status-pill ${workflowStatus(seminar)}`}>{statusLabel(seminar)}</span></div><p>{seminar.title} · {dateLabel(seminar)}</p><div className="seminar-meta"><span><Clock3 size={15} />{timeLabel(seminar.startTime)} – {timeLabel(seminar.endTime)}</span>{seminar.studentCount && <span><UsersRound size={15} />{seminar.studentCount} students</span>}{seminar.grade10 && <span className="grade-pill">G10</span>}{seminar.grade11 && <span className="grade-pill">G11</span>}</div></div><div className="row-actions">{seminar.locationLink && <a href={seminar.locationLink} target="_blank" rel="noreferrer" className="icon-action" title="Open map"><MapPin size={18} /></a>}<button className="btn btn-secondary detail-button" onClick={() => setDetailSeminar(seminar)}>View details</button></div></article>) : <div className="empty-state"><CalendarDays size={28} /><h3>No seminars found</h3><p>Try a different search or filter.</p></div>}</div>
    </section>
    {detailSeminar && <div className="modal-backdrop"><section className="modal details-modal" role="dialog" aria-modal="true" aria-label="Seminar overview"><div className="modal-heading"><div><span className="eyebrow accent">{['completed', 'cancelled'].includes(workflowStatus(detailSeminar)) ? 'Past seminar' : 'Planned seminar'}</span><h2>{detailSeminar.school}</h2></div><button className="icon-action" onClick={() => setDetailSeminar(null)} aria-label="Close details"><X /></button></div><div className="detail-hero"><div className="date-block"><span>{detailSeminar.date1 ? format(parseISO(detailSeminar.date1), 'MMM') : 'TBC'}</span><strong>{detailSeminar.date1 ? format(parseISO(detailSeminar.date1), 'dd') : '—'}</strong></div><div><h3>{detailSeminar.title}</h3><p>{dateLabel(detailSeminar)}</p></div><span className={`status-pill ${workflowStatus(detailSeminar)}`}>{statusLabel(detailSeminar)}</span></div><div className="detail-grid"><div><span>Time</span><strong>{timeLabel(detailSeminar.startTime)} – {timeLabel(detailSeminar.endTime)}</strong></div><div><span>Participants</span><strong>{detailSeminar.studentCount ? `${detailSeminar.studentCount} students` : 'Not recorded'}</strong></div><div><span>Grades</span><strong>{[detailSeminar.grade10 && 'Grade 10', detailSeminar.grade11 && 'Grade 11'].filter(Boolean).join(' · ') || 'Not recorded'}</strong></div><div><span>Location</span>{detailSeminar.locationLink ? <a href={detailSeminar.locationLink} target="_blank" rel="noreferrer"><MapPin size={15} />Open map</a> : <strong>Not added</strong>}</div></div>{workflowStatus(detailSeminar) === 'completed' && <div className="outcome-summary"><div><span className="eyebrow accent">Seminar outcome</span><h3>Delivery record</h3></div><div className="outcome-stats"><span><UsersRound size={15} /><strong>{outcomesOf(detailSeminar).attendance || '—'}</strong> attended</span><span><ListTodo size={15} /><strong>{outcomesOf(detailSeminar).followUps.filter(task => !task.done).length}</strong> open tasks</span></div>{outcomesOf(detailSeminar).notes && <p>{outcomesOf(detailSeminar).notes}</p>}{outcomesOf(detailSeminar).photoLinks.length > 0 && <div className="outcome-links">{outcomesOf(detailSeminar).photoLinks.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={`${url}-${index}`}><Image size={15} />Photo / album {index + 1}</a>)}</div>}{outcomesOf(detailSeminar).followUps.length > 0 && <div className="outcome-tasks">{outcomesOf(detailSeminar).followUps.map((task, index) => <span key={`${task.text}-${index}`} className={task.done ? 'done' : ''}>{task.done ? '✓' : '○'} {task.text}</span>)}</div>}</div>}<div className="detail-contacts"><div><span className="eyebrow accent">School contacts</span><h3>People to contact</h3></div>{detailContacts.length ? <div className="contact-chips">{detailContacts.map((person, index) => <a key={`${person.name}-${index}`} href={phoneLink(person.phone)} className="contact-chip"><span>{person.name || 'School contact'}<small>{person.role || 'Contact'}{person.primary ? ' · Primary' : ''}</small></span>{person.phone && <b><Phone size={14} />{formatPhoneNumber(person.phone)}</b>}</a>)}</div> : <p className="no-contacts">No contact is linked to this school yet.</p>}</div><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setDetailSeminar(null)}>Close</button>{canEdit && <button className="btn btn-primary" onClick={() => { setDetailSeminar(null); openModal(detailSeminar); }}><Edit3 size={16} />Edit details</button>}</div></section></div>}
    {modalOpen && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="seminar-dialog-title"><div className="modal-heading"><div><span className="eyebrow accent">Seminar details</span><h2 id="seminar-dialog-title">{editingId ? 'Update seminar' : 'New seminar'}</h2></div><button className="icon-action" onClick={() => setModalOpen(false)} aria-label="Close seminar form"><X /></button></div><form onSubmit={save} noValidate>
      {formErrors.general && <p className="form-feedback error" role="alert">{formErrors.general}</p>}
      <div className="form-group"><label htmlFor="seminar-title">Session title</label><input id="seminar-title" required maxLength={200} value={formData.title} aria-invalid={Boolean(formErrors.title)} aria-describedby={formErrors.title ? 'seminar-title-error' : undefined} onChange={e => { setFormData({ ...formData, title: e.target.value }); setFormErrors(current => ({ ...current, title: '' })); }} />{formErrors.title && <small className="field-error" id="seminar-title-error">{formErrors.title}</small>}</div><div className="form-group"><label htmlFor="seminar-school">School</label><select id="seminar-school" required value={formSchoolKey} aria-invalid={Boolean(formErrors.school)} aria-describedby={formErrors.school ? 'seminar-school-error' : undefined} onChange={e => { const school = schools.find(item => item.key === e.target.value); setFormData({ ...formData, schoolId: school?.schoolId || '', school: school?.name || '' }); setFormErrors(current => ({ ...current, school: '' })); }}><option value="" disabled>{schools.length ? 'Select a school' : 'Add a school to the directory first'}</option>{schools.map(school => <option key={school.key} value={school.key}>{school.name}</option>)}</select>{formErrors.school && <small className="field-error" id="seminar-school-error">{formErrors.school}</small>}</div>
      <div className="form-grid"><div className="form-group"><label htmlFor="seminar-start-date">Start date</label><input id="seminar-start-date" required type="date" value={formData.date1} aria-invalid={Boolean(formErrors.date1)} aria-describedby={formErrors.date1 ? 'seminar-start-date-error' : undefined} onChange={e => { setFormData({ ...formData, date1: e.target.value, ...(formData.date2 && formData.date2 < e.target.value ? { date2: '' } : {}) }); setFormErrors(current => ({ ...current, date1: '', date2: '' })); }} />{formErrors.date1 && <small className="field-error" id="seminar-start-date-error">{formErrors.date1}</small>}</div><div className="form-group"><label htmlFor="seminar-second-date">Second date <em>(optional)</em></label><input id="seminar-second-date" type="date" min={formData.date1 || undefined} value={formData.date2 || ''} aria-invalid={Boolean(formErrors.date2)} aria-describedby={formErrors.date2 ? 'seminar-second-date-error' : undefined} onChange={e => { setFormData({ ...formData, date2: e.target.value }); setFormErrors(current => ({ ...current, date2: '' })); }} />{formErrors.date2 && <small className="field-error" id="seminar-second-date-error">{formErrors.date2}</small>}</div></div><div className="form-grid"><div className="form-group"><label htmlFor="seminar-start-time">Start time</label><input id="seminar-start-time" required type="time" value={formData.startTime} aria-invalid={Boolean(formErrors.startTime)} aria-describedby={formErrors.startTime ? 'seminar-start-time-error' : undefined} onChange={e => { setFormData({ ...formData, startTime: e.target.value }); setFormErrors(current => ({ ...current, startTime: '', endTime: '' })); }} />{formErrors.startTime && <small className="field-error" id="seminar-start-time-error">{formErrors.startTime}</small>}</div><div className="form-group"><label htmlFor="seminar-end-time">End time</label><input id="seminar-end-time" required type="time" min={formData.startTime || undefined} value={formData.endTime} aria-invalid={Boolean(formErrors.endTime)} aria-describedby={formErrors.endTime ? 'seminar-end-time-error' : undefined} onChange={e => { setFormData({ ...formData, endTime: e.target.value }); setFormErrors(current => ({ ...current, endTime: '' })); }} />{formErrors.endTime && <small className="field-error" id="seminar-end-time-error">{formErrors.endTime}</small>}</div></div>
      <div className="form-grid"><div className="form-group"><label htmlFor="seminar-status">Status</label><select id="seminar-status" value={workflowStatus(formData)} onChange={e => setFormData({ ...formData, status: e.target.value })}><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div><div className="form-group"><label htmlFor="seminar-students">Expected students</label><input id="seminar-students" type="number" min="0" value={formData.studentCount || ''} aria-invalid={Boolean(formErrors.studentCount)} aria-describedby={formErrors.studentCount ? 'seminar-students-error' : undefined} onChange={e => { setFormData({ ...formData, studentCount: e.target.value }); setFormErrors(current => ({ ...current, studentCount: '' })); }} />{formErrors.studentCount && <small className="field-error" id="seminar-students-error">{formErrors.studentCount}</small>}</div></div><div className="form-group"><label htmlFor="seminar-map">Map link <em>(optional)</em></label><input id="seminar-map" type="url" placeholder="https://maps.google.com/..." value={formData.locationLink || ''} aria-invalid={Boolean(formErrors.locationLink)} aria-describedby={formErrors.locationLink ? 'seminar-map-error' : undefined} onChange={e => { setFormData({ ...formData, locationLink: e.target.value }); setFormErrors(current => ({ ...current, locationLink: '' })); }} />{formErrors.locationLink && <small className="field-error" id="seminar-map-error">{formErrors.locationLink}</small>}</div>{workflowStatus(formData) === 'completed' && <section className="outcomes-editor"><div><span className="eyebrow accent">After the seminar</span><h3>Outcome record</h3><p>Add the final attendance, any outcome notes, photo links, and follow-up tasks.</p></div><div className="form-group"><label htmlFor="seminar-attendance">Actual attendance</label><input id="seminar-attendance" type="number" min="0" placeholder="e.g. 32" value={outcomesOf(formData).attendance} aria-invalid={Boolean(formErrors.attendance)} aria-describedby={formErrors.attendance ? 'seminar-attendance-error' : undefined} onChange={e => { updateOutcomes({ attendance: e.target.value }); setFormErrors(current => ({ ...current, attendance: '' })); }} />{formErrors.attendance && <small className="field-error" id="seminar-attendance-error">{formErrors.attendance}</small>}</div><div className="form-group"><label htmlFor="seminar-outcome-notes">Outcome notes</label><textarea id="seminar-outcome-notes" placeholder="What was completed? What needs attention?" value={outcomesOf(formData).notes} onChange={e => updateOutcomes({ notes: e.target.value })} /></div><div className="outcome-input-list"><label>Photo or album links</label>{outcomesOf(formData).photoLinks.map((url, index) => <div className="outcome-input-row" key={`photo-${index}`}><span><input type="url" aria-label={`Photo or album link ${index + 1}`} placeholder="https://drive.google.com/..." value={url} aria-invalid={Boolean(formErrors[`photo-${index}`])} aria-describedby={formErrors[`photo-${index}`] ? `photo-${index}-error` : undefined} onChange={e => { updateOutcomes({ photoLinks: outcomesOf(formData).photoLinks.map((item, itemIndex) => itemIndex === index ? e.target.value : item) }); setFormErrors(current => ({ ...current, [`photo-${index}`]: '' })); }} />{formErrors[`photo-${index}`] && <small className="field-error" id={`photo-${index}-error`}>{formErrors[`photo-${index}`]}</small>}</span><button type="button" aria-label={`Remove photo link ${index + 1}`} className="icon-action" onClick={() => updateOutcomes({ photoLinks: outcomesOf(formData).photoLinks.filter((_, itemIndex) => itemIndex !== index) })}><X size={16} /></button></div>)}<button type="button" className="btn btn-secondary" onClick={() => updateOutcomes({ photoLinks: [...outcomesOf(formData).photoLinks, ''] })}><Link size={16} />Add photo link</button></div><div className="outcome-input-list"><label>Follow-up tasks</label>{outcomesOf(formData).followUps.map((task, index) => <div key={`task-${index}`}><label className="task-check"><input type="checkbox" aria-label={`Mark follow-up ${index + 1} complete`} checked={task.done || false} onChange={e => updateFollowUp(index, { done: e.target.checked })} /></label><input aria-label={`Follow-up task ${index + 1}`} placeholder="e.g. Send materials to the coordinator" value={task.text || ''} onChange={e => updateFollowUp(index, { text: e.target.value })} /><button type="button" aria-label={`Remove follow-up ${index + 1}`} className="icon-action" onClick={() => updateOutcomes({ followUps: outcomesOf(formData).followUps.filter((_, taskIndex) => taskIndex !== index) })}><X size={16} /></button></div>)}<button type="button" className="btn btn-secondary" onClick={() => updateOutcomes({ followUps: [...outcomesOf(formData).followUps, { text: '', done: false }] })}><Plus size={16} />Add follow-up</button></div></section>}<div className="check-row" role="group" aria-label="Grades" aria-describedby={formErrors.grades ? 'seminar-grades-error' : undefined}><label><input type="checkbox" checked={formData.grade10} onChange={e => { setFormData({ ...formData, grade10: e.target.checked }); setFormErrors(current => ({ ...current, grades: '' })); }} />Grade 10</label><label><input type="checkbox" checked={formData.grade11} onChange={e => { setFormData({ ...formData, grade11: e.target.checked }); setFormErrors(current => ({ ...current, grades: '' })); }} />Grade 11</label></div>{formErrors.grades && <small className="field-error grade-error" id="seminar-grades-error">{formErrors.grades}</small>}<div className="modal-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save seminar'}</button></div>
    </form></div></div>}
  </div>;
}
