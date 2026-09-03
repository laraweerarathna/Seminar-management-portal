import React, { useContext, useMemo, useState } from 'react';
import { Building2, CalendarDays, Phone, Save, Search, UsersRound } from 'lucide-react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { AppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import { buildSchoolDirectory, normalizeSchoolName, recordMatchesSchool } from '../utils/schools';
import { formatPhoneNumber, phoneLink } from '../utils/phone';
import PageHeader from './PageHeader';

const seminarStatus = (seminar) => seminar.status === 'upcoming' ? 'confirmed' : seminar.status || 'draft';
const byDateAscending = (first, second) => {
  if (!first.date1) return 1;
  if (!second.date1) return -1;
  return first.date1.localeCompare(second.date1);
};

export default function Schools() {
  const { contacts, seminars, schoolNotes, user, canEdit } = useContext(AppContext);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('');

  const schools = useMemo(
    () => buildSchoolDirectory({ contacts, seminars, schoolRecords: schoolNotes }),
    [contacts, seminars, schoolNotes],
  );
  const selectedSchool = selected && (
    schools.find(school => school.key === selected.key)
    || schools.find(school => normalizeSchoolName(school.name) === normalizeSchoolName(selected.name))
  );
  const visibleSchools = schools.filter(school => school.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const planned = selectedSchool?.seminars.filter(seminar => ['draft', 'confirmed'].includes(seminarStatus(seminar))).sort(byDateAscending) || [];
  const past = selectedSchool?.seminars.filter(seminar => ['completed', 'cancelled'].includes(seminarStatus(seminar))).sort((a, b) => byDateAscending(b, a)) || [];

  const openProfile = (school) => {
    setSelected({ key: school.key, name: school.name });
    setNote(school.note || '');
    setNoteStatus('');
  };

  const saveNote = async () => {
    if (!selectedSchool || !canEdit || noteStatus === 'saving') return;
    const schoolId = selectedSchool.schoolId || doc(collection(db, 'schools')).id;
    const matchingContacts = contacts.filter(contact => recordMatchesSchool(contact.schoolId, contact.schoolName, selectedSchool));
    const matchingSeminars = seminars.filter(seminar => recordMatchesSchool(seminar.schoolId, seminar.school, selectedSchool));
    const operationCount = matchingContacts.length + matchingSeminars.length + 2;
    if (operationCount > 490) {
      setNoteStatus('too-many');
      return;
    }

    setNoteStatus('saving');
    try {
      const batch = writeBatch(db);
      const updatedBy = user?.displayName || user?.email || 'Portal user';
      batch.set(doc(db, 'schools', schoolId), {
        schoolId,
        name: selectedSchool.name,
        note,
        archived: false,
        updatedAt: serverTimestamp(),
        updatedBy,
      }, { merge: true });
      matchingContacts.forEach(contact => batch.set(doc(db, 'contacts', String(contact.id)), {
        schoolId,
        schoolName: selectedSchool.name,
      }, { merge: true }));
      matchingSeminars.forEach(seminar => batch.update(doc(db, 'seminars', String(seminar.id)), {
        schoolId,
        school: selectedSchool.name,
      }));
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        entityType: 'school',
        entityId: schoolId,
        action: 'note updated',
        label: selectedSchool.name,
        createdAt: serverTimestamp(),
        user: updatedBy,
        userUid: user.uid,
      });
      await batch.commit();
      setSelected({ key: `id:${schoolId}`, name: selectedSchool.name });
      setNoteStatus('saved');
    } catch (error) {
      console.error('Unable to save school note:', error);
      setNoteStatus('error');
    }
  };

  return <div className="page animate-fade-in">
    <PageHeader eyebrow="School relationship management" title="School profiles" description="See every contact, past session, future plan, and internal note for each school in one place." />
    <div className="schools-layout">
      <section className="school-list-panel">
        <div className="panel-heading compact"><div><span className="eyebrow accent">Directory</span><h2>Schools</h2></div><span className="panel-count">{visibleSchools.length}</span></div>
        <label className="search-field"><Search size={17} /><span className="sr-only">Search schools</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search schools" /></label>
        <div className="school-list">
          {visibleSchools.map(school => <button key={school.key} className={`school-list-item ${selectedSchool?.key === school.key ? 'active' : ''}`} onClick={() => openProfile(school)}><span className="school-list-icon"><Building2 size={18} /></span><span><strong>{school.name}</strong><small>{school.seminarCount} seminars · {school.contactCount} contacts</small></span></button>)}
          {!visibleSchools.length && <p className="no-contacts school-list-empty">No schools found.</p>}
        </div>
      </section>
      <section className="school-profile-panel">
        {selectedSchool ? <>
          <div className="profile-heading"><div><span className="eyebrow accent">School profile</span><h2>{selectedSchool.name}</h2></div><span className="profile-count"><CalendarDays size={16} />{planned.length} planned</span></div>
          <div className="profile-columns">
            <div><h3><UsersRound size={17} />Contacts</h3>{selectedSchool.people.length ? selectedSchool.people.map((person, index) => {
              const ContactElement = person.phone ? 'a' : 'div';
              return <ContactElement className="profile-contact" key={`${person.phone || person.name}-${index}`} {...(person.phone ? { href: phoneLink(person.phone) } : {})}><span><strong>{person.name || 'School contact'}</strong><small>{person.role || 'Contact'}{person.primary ? ' · Primary' : ''}</small></span>{person.phone && <b><Phone size={14} />{formatPhoneNumber(person.phone)}</b>}</ContactElement>;
            }) : <p className="no-contacts">No contact saved yet.</p>}</div>
            <div><h3><CalendarDays size={17} />Seminars</h3><div className="profile-sessions"><strong>Planned ({planned.length})</strong>{planned.length ? planned.map(seminar => <span key={seminar.id}>{seminar.date1 || 'TBC'} · {seminar.title}</span>) : <small>No planned sessions.</small>}<strong>Past ({past.length})</strong>{past.length ? past.slice(0, 5).map(seminar => <span key={seminar.id}>{seminar.date1 || 'TBC'} · {seminar.title}</span>) : <small>No past sessions.</small>}</div></div>
          </div>
          <div className="profile-notes"><div><span className="eyebrow accent">Internal notes</span><h3>Relationship notes</h3></div><label className="sr-only" htmlFor="relationship-note">Relationship notes</label><textarea id="relationship-note" value={note} disabled={!canEdit} onChange={event => { setNote(event.target.value); setNoteStatus(''); }} placeholder="Add context, follow-up notes, or preferences for this school..." />{canEdit && <div className="note-actions"><button onClick={saveNote} disabled={noteStatus === 'saving'} className="btn btn-primary"><Save size={16} />{noteStatus === 'saving' ? 'Saving…' : 'Save note'}</button><span className={noteStatus === 'error' || noteStatus === 'too-many' ? 'save-error' : 'save-success'} aria-live="polite">{noteStatus === 'saved' ? 'Saved' : noteStatus === 'error' ? 'Could not save the note.' : noteStatus === 'too-many' ? 'Too many linked records to update.' : ''}</span></div>}</div>
        </> : <div className="empty-state"><Building2 size={30} /><h3>Select a school</h3><p>Choose a school to see its profile.</p></div>}
      </section>
    </div>
  </div>;
}
