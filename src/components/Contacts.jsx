import React, { useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Phone, Plus, Search, Star, Trash2, UserPlus, X } from 'lucide-react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { AppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import { buildSchoolDirectory, normalizeSchoolName } from '../utils/schools';
import { formatPhoneInput, formatPhoneNumber, isValidPhoneNumber, phoneDigits, phoneLink } from '../utils/phone';
import PageHeader from './PageHeader';
import ConfirmDialog from './ConfirmDialog';

const deduplicatePeople = (people) => {
  const seen = new Set();
  return people.filter(person => {
    const phone = phoneDigits(person.phone);
    const key = phone || `${String(person.name || '').trim().toLocaleLowerCase()}|${String(person.role || '').trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function Contacts() {
  const { contacts, seminars, schoolNotes, user, canEdit, canDelete, notify } = useContext(AppContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ schoolName: '', people: [] });
  const [formErrors, setFormErrors] = useState({});
  const [pendingDeleteSchool, setPendingDeleteSchool] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const schools = useMemo(
    () => buildSchoolDirectory({ contacts, seminars, schoolRecords: schoolNotes }),
    [contacts, seminars, schoolNotes],
  );

  const filteredSchools = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return schools;
    return schools.filter(school => (
      school.name.toLocaleLowerCase().includes(query)
      || school.people.some(person => String(person.name || '').toLocaleLowerCase().includes(query))
    ));
  }, [schools, searchQuery]);

  const handleOpenModal = (school = null) => {
    setEditingSchool(school);
    setFormErrors({});
    setFormData({
      schoolName: school?.name || '',
      people: school ? school.people.map(person => ({ ...person })) : [],
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingSchool(null);
    setFormErrors({});
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!canEdit || saving) return;

    const schoolName = formData.schoolName.trim().replace(/\s+/g, ' ');
    const validationErrors = {};
    if (!schoolName) validationErrors.schoolName = 'Enter a school name.';

    const cleanedPeople = [];
    for (let index = 0; index < formData.people.length; index += 1) {
      const person = formData.people[index];
      const name = String(person.name || '').trim();
      const normalizedPhone = formatPhoneNumber(person.phone);
      if (!name) validationErrors[`person-${index}-name`] = `Enter a name for contact ${index + 1}.`;
      if (!isValidPhoneNumber(person.phone)) validationErrors[`person-${index}-phone`] = 'Enter a 10-digit phone number.';
      cleanedPeople.push({
        name,
        role: String(person.role || '').trim(),
        phone: normalizedPhone,
        primary: Boolean(person.primary),
      });
    }

    if (cleanedPeople.length && !cleanedPeople.some(person => person.primary)) cleanedPeople[0].primary = true;

    const normalizedName = normalizeSchoolName(schoolName);
    const sameNameSchool = schools.find(school => school.key !== editingSchool?.key && normalizeSchoolName(school.name) === normalizedName);
    if (!editingSchool && sameNameSchool) validationErrors.schoolName = 'This school is already in the directory. Edit its existing record instead.';
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }

    const schoolId = sameNameSchool?.schoolId || editingSchool?.schoolId || doc(collection(db, 'schools')).id;
    const affectedIds = new Set([schoolId, editingSchool?.schoolId, sameNameSchool?.schoolId].filter(Boolean).map(String));
    const affectedNames = new Set([schoolName, editingSchool?.name, sameNameSchool?.name].filter(Boolean).map(normalizeSchoolName));
    const isAffected = (schoolIdValue, schoolNameValue) => (
      (schoolIdValue && affectedIds.has(String(schoolIdValue)))
      || affectedNames.has(normalizeSchoolName(schoolNameValue))
    );
    const affectedContacts = contacts.filter(contact => isAffected(contact.schoolId || contact.mergedInto, contact.schoolName));
    const affectedSeminars = seminars.filter(seminar => isAffected(seminar.schoolId, seminar.school));
    const affectedSchoolRecords = schoolNotes.filter(record => isAffected(record.schoolId || record.id, record.name));
    const deduplicatedPeople = deduplicatePeople([...(sameNameSchool?.people || []), ...cleanedPeople]);
    const selectedPrimaryIndex = Math.max(0, deduplicatedPeople.findIndex(person => person.primary));
    const peopleToSave = deduplicatedPeople.map((person, index) => ({ ...person, primary: index === selectedPrimaryIndex }));

    const operationCount = affectedContacts.length + affectedSeminars.length + affectedSchoolRecords.length + 3;
    if (operationCount > 490) {
      setFormErrors({ general: 'This school has too many linked records to update safely in one operation.' });
      return;
    }

    setFormErrors({});
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const updatedBy = user?.displayName || user?.email || 'Portal user';
      const note = sameNameSchool?.note || editingSchool?.note || '';

      batch.set(doc(db, 'schools', schoolId), {
        schoolId,
        name: schoolName,
        ...(note ? { note } : {}),
        archived: false,
        updatedAt: serverTimestamp(),
        updatedBy,
      }, { merge: true });

      batch.set(doc(db, 'contacts', schoolId), {
        id: schoolId,
        schoolId,
        schoolName,
        people: peopleToSave,
        archived: false,
        updatedAt: serverTimestamp(),
        updatedBy,
      });

      affectedContacts.forEach(contact => {
        if (String(contact.id) === schoolId) return;
        batch.set(doc(db, 'contacts', String(contact.id)), {
          schoolId,
          schoolName,
          people: [],
          contactPerson: '',
          role: '',
          phone: '',
          phone2: '',
          archived: true,
          mergedInto: schoolId,
          updatedAt: serverTimestamp(),
          updatedBy,
        }, { merge: true });
      });

      affectedSeminars.forEach(seminar => {
        batch.update(doc(db, 'seminars', String(seminar.id)), {
          schoolId,
          school: schoolName,
          updatedAt: serverTimestamp(),
          updatedBy,
        });
      });

      affectedSchoolRecords.forEach(record => {
        if (String(record.id) === schoolId) return;
        batch.set(doc(db, 'schools', String(record.id)), {
          archived: true,
          mergedInto: schoolId,
          updatedAt: serverTimestamp(),
          updatedBy,
        }, { merge: true });
      });

      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        entityType: 'school',
        entityId: schoolId,
        action: editingSchool ? 'updated' : 'created',
        label: schoolName,
        createdAt: serverTimestamp(),
        user: updatedBy,
        userUid: user.uid,
      });
      await batch.commit();
      setIsModalOpen(false);
      setEditingSchool(null);
      notify(`${schoolName} ${editingSchool ? 'updated' : 'added'} successfully.`);
    } catch (error) {
      console.error('Error saving school:', error);
      setFormErrors({ general: 'The school could not be saved. Check your permissions and connection, then try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const school = pendingDeleteSchool;
    if (!canDelete || !school || deleting) return;
    const hasSeminars = school.seminarCount > 0;

    const relatedContacts = contacts.filter(contact => (
      (school.schoolId && [contact.schoolId, contact.mergedInto].some(id => String(id || '') === String(school.schoolId)))
      || normalizeSchoolName(contact.schoolName) === normalizeSchoolName(school.name)
    ));
    const relatedSchoolRecords = schoolNotes.filter(record => (
      (school.schoolId && [record.schoolId, record.id].some(id => String(id || '') === String(school.schoolId)))
      || normalizeSchoolName(record.name) === normalizeSchoolName(school.name)
    ));

    setDeleting(true);
    try {
      const batch = writeBatch(db);
      relatedContacts.forEach(contact => batch.delete(doc(db, 'contacts', String(contact.id))));
      if (!hasSeminars) relatedSchoolRecords.forEach(record => batch.delete(doc(db, 'schools', String(record.id))));
      const activityRef = doc(collection(db, 'activities'));
      batch.set(activityRef, {
        entityType: 'school',
        entityId: school.schoolId || school.key,
        action: hasSeminars ? 'contacts deleted' : 'deleted',
        label: school.name,
        createdAt: serverTimestamp(),
        user: user?.displayName || user?.email || 'Portal user',
        userUid: user.uid,
      });
      await batch.commit();
      setPendingDeleteSchool(null);
      notify(hasSeminars ? `${school.name} contact information was deleted.` : `${school.name} was deleted.`);
    } catch (error) {
      console.error('Error deleting school:', error);
      notify('The school could not be deleted. Check your connection and try again.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const addPerson = () => setFormData(current => ({
    ...current,
    people: [...current.people, { name: '', role: '', phone: '', primary: current.people.length === 0 }],
  }));

  const updatePerson = (index, field, value) => {
    setFormData(current => ({
      ...current,
      people: current.people.map((person, personIndex) => personIndex === index ? { ...person, [field]: value } : person),
    }));
    setFormErrors(current => {
      const next = { ...current };
      delete next[`person-${index}-${field}`];
      return next;
    });
  };

  const removePerson = (index) => {
    setFormData(current => {
      const people = current.people.filter((_, personIndex) => personIndex !== index);
      if (people.length && !people.some(person => person.primary)) people[0] = { ...people[0], primary: true };
      return { ...current, people };
    });
    setFormErrors({});
  };

  const setPrimary = (index) => setFormData(current => ({
    ...current,
    people: current.people.map((person, personIndex) => ({ ...person, primary: personIndex === index })),
  }));

  return (
    <div className="page directory-page animate-fade-in">
      <PageHeader eyebrow="School relationship management" title="School directory" description="Keep school records and contact information together in one searchable place.">
        {canEdit && <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={18} />Add school</button>}
      </PageHeader>

      <section className="content-section directory-panel">
        <div className="section-toolbar directory-toolbar">
          <div className="panel-heading">
            <div><span className="eyebrow accent">Directory records</span><h2>Schools and contacts</h2></div>
            <span className="panel-count">{filteredSchools.length}</span>
          </div>
          <label className="search-field directory-search-field">
            <Search size={17} />
            <span className="sr-only">Search schools or contact names</span>
            <input type="search" placeholder="Search schools or contacts" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} />
          </label>
        </div>

        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead><tr><th>School</th><th>Contacts</th>{canEdit && <th className="actions-heading">Actions</th>}</tr></thead>
            <tbody>
              {filteredSchools.map(school => (
                <tr key={school.key}>
                  <td><strong>{school.name}</strong><small>{school.seminarCount} seminar{school.seminarCount === 1 ? '' : 's'}</small></td>
                  <td>
                    <div className="directory-people">
                      {school.people.length ? school.people.map((person, index) => (
                        <div key={`${person.phone || person.name}-${index}`} className="directory-person">
                          <span><strong>{person.name || 'School contact'}{person.primary && <em className="contact-primary"><Star size={11} fill="currentColor" />Primary</em>}</strong><small className="contact-role">{person.role || 'School contact'}</small></span>
                          {person.phone && <a href={phoneLink(person.phone)} className="phone-link"><Phone size={14} />{formatPhoneNumber(person.phone)}</a>}
                        </div>
                      )) : <span className="no-contacts">No contact saved yet.</span>}
                    </div>
                  </td>
                  {canEdit && <td className="directory-actions">
                    <button onClick={() => handleOpenModal(school)} className="icon-action" title={`Edit ${school.name}`} aria-label={`Edit ${school.name}`}><Edit2 size={18} /></button>
                    {canDelete && school.contactDocuments.length > 0 && <button onClick={() => setPendingDeleteSchool(school)} className="icon-action danger" title={`Delete ${school.name}`} aria-label={`Delete ${school.name}`}><Trash2 size={18} /></button>}
                  </td>}
                </tr>
              ))}
              {!filteredSchools.length && <tr><td colSpan={canEdit ? 3 : 2}><div className="empty-state"><Search size={26} /><h3>No schools found</h3><p>Try a different search or add a school.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && createPortal(
        <div className="modal-backdrop" role="presentation">
          <div className="modal school-modal animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="school-dialog-title">
            <div className="modal-heading">
              <div><span className="eyebrow accent">School details</span><h2 id="school-dialog-title">{editingSchool ? 'Edit school' : 'Add school'}</h2></div>
              <button type="button" onClick={handleCloseModal} className="icon-action" aria-label="Close school form"><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} noValidate>
              {formErrors.general && <p className="form-feedback error" role="alert">{formErrors.general}</p>}
              <div className="form-group">
                <label htmlFor="school-name">School name</label>
                <input id="school-name" required autoFocus type="text" className="form-input" value={formData.schoolName} aria-invalid={Boolean(formErrors.schoolName)} aria-describedby={formErrors.schoolName ? 'school-name-error' : undefined} onChange={event => { setFormData(current => ({ ...current, schoolName: event.target.value })); setFormErrors(current => ({ ...current, schoolName: '' })); }} />
                {formErrors.schoolName && <small className="field-error" id="school-name-error">{formErrors.schoolName}</small>}
              </div>

              <div className="contact-form-section">
                <h3>Contacts at this school <span>(optional)</span></h3>
                {!formData.people.length && <p className="no-contacts">You can save the school now and add contact details later.</p>}
                {formData.people.map((person, index) => (
                  <div key={index} className="contact-form-card">
                    <button type="button" onClick={() => removePerson(index)} className="icon-action remove-contact" aria-label={`Remove contact ${index + 1}`}><X size={18} /></button>
                    <div className="form-group"><label htmlFor={`contact-name-${index}`}>Name</label><input id={`contact-name-${index}`} required type="text" className="form-input" value={person.name} aria-invalid={Boolean(formErrors[`person-${index}-name`])} aria-describedby={formErrors[`person-${index}-name`] ? `contact-name-${index}-error` : undefined} onChange={event => updatePerson(index, 'name', event.target.value)} />{formErrors[`person-${index}-name`] && <small className="field-error" id={`contact-name-${index}-error`}>{formErrors[`person-${index}-name`]}</small>}</div>
                    <label className="primary-check"><input type="radio" name="primary-contact" checked={person.primary || false} onChange={() => setPrimary(index)} />Primary contact for this school</label>
                    <div className="form-grid">
                      <div className="form-group"><label htmlFor={`contact-role-${index}`}>Role</label><input id={`contact-role-${index}`} type="text" className="form-input" placeholder="e.g. Principal, math teacher" value={person.role} onChange={event => updatePerson(index, 'role', event.target.value)} /></div>
                      <div className="form-group"><label htmlFor={`contact-phone-${index}`}>Phone number</label><input id={`contact-phone-${index}`} required inputMode="numeric" autoComplete="tel" type="tel" maxLength={12} className="form-input" placeholder="071 234 5678" value={person.phone} aria-invalid={Boolean(formErrors[`person-${index}-phone`])} aria-describedby={formErrors[`person-${index}-phone`] ? `contact-phone-${index}-error` : undefined} onChange={event => updatePerson(index, 'phone', formatPhoneInput(event.target.value))} />{formErrors[`person-${index}-phone`] && <small className="field-error" id={`contact-phone-${index}-error`}>{formErrors[`person-${index}-phone`]}</small>}</div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addPerson} className="btn btn-secondary add-contact-button"><UserPlus size={16} />{formData.people.length ? 'Add another person' : 'Add contact person'}</button>
              </div>

              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save school'}</button></div>
            </form>
          </div>
        </div>,
        document.body,
      )}
      <ConfirmDialog
        open={Boolean(pendingDeleteSchool)}
        title={pendingDeleteSchool?.seminarCount > 0 ? 'Delete contact information?' : 'Delete this school?'}
        message={pendingDeleteSchool?.seminarCount > 0 ? `${pendingDeleteSchool?.name} has seminar history. Its contacts will be deleted, while the school remains linked to those seminars.` : `${pendingDeleteSchool?.name || 'This school'} and all of its contact information will be permanently deleted.`}
        confirmLabel={pendingDeleteSchool?.seminarCount > 0 ? 'Delete contacts' : 'Delete school'}
        busy={deleting}
        onCancel={() => setPendingDeleteSchool(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
