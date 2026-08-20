import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { Building2, CalendarDays, Edit3, Phone, Save, Search, UsersRound } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const normalisePeople = (contact) => contact.people || (contact.contactPerson || contact.phone ? [{ name: contact.contactPerson || 'School contact', role: contact.role || '', phone: contact.phone || '', primary: true }] : []);
const status = (seminar) => seminar.status === 'upcoming' ? 'confirmed' : seminar.status || 'draft';

export default function Schools() {
  const { contacts, seminars, schoolNotes, user, canEdit } = useContext(AppContext);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const schools = useMemo(() => {
    const names = new Set([...contacts.map(contact => contact.schoolName), ...seminars.map(seminar => seminar.school)]);
    return [...names].filter(Boolean).sort().map(name => ({ name, contactCount: contacts.filter(contact => contact.schoolName === name).reduce((total, contact) => total + normalisePeople(contact).length, 0), seminarCount: seminars.filter(seminar => seminar.school === name).length }));
  }, [contacts, seminars]);
  const profile = selected && { name: selected, contacts: contacts.filter(contact => contact.schoolName === selected).flatMap(normalisePeople), planned: seminars.filter(seminar => seminar.school === selected && ['draft', 'confirmed'].includes(status(seminar))), past: seminars.filter(seminar => seminar.school === selected && ['completed', 'cancelled'].includes(status(seminar))), note: schoolNotes.find(item => item.id === selected)?.note || '' };
  const [note, setNote] = useState('');
  const openProfile = (name) => { setSelected(name); setNote(schoolNotes.find(item => item.id === name)?.note || ''); };
  const saveNote = async () => { if (!selected) return; await setDoc(doc(db, 'schools', selected), { name: selected, note, updatedAt: serverTimestamp(), updatedBy: user?.displayName || user?.email || 'Portal user' }, { merge: true }); };

  return <div className="page animate-fade-in">
    <header className="page-header"><div><span className="eyebrow accent">School relationship management</span><h1>School profiles</h1><p>See every conversation, past session, future plan, and internal note for each school in one place.</p></div></header>
    <div className="schools-layout"><section className="school-list-panel"><label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search schools" /></label><div className="school-list">{schools.filter(school => school.name.toLowerCase().includes(query.toLowerCase())).map(school => <button key={school.name} className={`school-list-item ${selected === school.name ? 'active' : ''}`} onClick={() => openProfile(school.name)}><span className="school-list-icon"><Building2 size={18} /></span><span><strong>{school.name}</strong><small>{school.seminarCount} seminars · {school.contactCount} contacts</small></span></button>)}</div></section>
      <section className="school-profile-panel">{profile ? <><div className="profile-heading"><div><span className="eyebrow accent">School profile</span><h2>{profile.name}</h2></div><span className="profile-count"><CalendarDays size={16} />{profile.planned.length} planned</span></div><div className="profile-columns"><div><h3><UsersRound size={17} />Contacts</h3>{profile.contacts.length ? profile.contacts.map((person, index) => <a className="profile-contact" key={`${person.name}-${index}`} href={person.phone ? `tel:${person.phone}` : undefined}><span><strong>{person.name || 'School contact'}</strong><small>{person.role || 'Contact'}{person.primary ? ' · Primary' : ''}</small></span>{person.phone && <b><Phone size={14} />{person.phone}</b>}</a>) : <p className="no-contacts">No contact saved yet.</p>}</div><div><h3><CalendarDays size={17} />Seminars</h3><div className="profile-sessions"><strong>Planned ({profile.planned.length})</strong>{profile.planned.length ? profile.planned.map(seminar => <span key={seminar.id}>{seminar.date1 || 'TBC'} · {seminar.title}</span>) : <small>No planned sessions.</small>}<strong>Past ({profile.past.length})</strong>{profile.past.length ? profile.past.slice(0, 5).map(seminar => <span key={seminar.id}>{seminar.date1 || 'TBC'} · {seminar.title}</span>) : <small>No past sessions.</small>}</div></div></div><div className="profile-notes"><div><span className="eyebrow accent">Internal notes</span><h3>Relationship notes</h3></div><textarea value={note} disabled={!canEdit} onChange={event => setNote(event.target.value)} placeholder="Add context, follow-up notes, or preferences for this school..." />{canEdit && <button onClick={saveNote} className="btn btn-primary"><Save size={16} />Save note</button>}</div></> : <div className="empty-state"><Building2 size={30} /><h3>Select a school</h3><p>Choose a school to see its profile.</p></div>}</section>
    </div>
  </div>;
}
