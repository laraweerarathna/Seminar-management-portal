import { formatPhoneNumber, phoneDigits } from './phone.js';

const schoolNameAliases = new Map([
  ['deeyakaduwa vidyartha kanishta vidyalaya', 'Diyakaduwa Vidyartha Kanishta Vidyalaya'],
]);

export const canonicalSchoolName = (name = '') => {
  const cleanedName = String(name).trim().replace(/\s+/g, ' ');
  return schoolNameAliases.get(cleanedName.toLocaleLowerCase()) || cleanedName;
};

export const normalizeSchoolName = (name = '') => canonicalSchoolName(name).toLocaleLowerCase();

export const peopleForContact = (contact = {}) => {
  if (Array.isArray(contact.people)) {
    return contact.people.map((person, index) => ({
      name: person?.name || '',
      role: person?.role || '',
      phone: formatPhoneNumber(person?.phone),
      primary: person?.primary ?? index === 0,
    }));
  }

  const people = [];
  if (contact.contactPerson || contact.phone) {
    people.push({
      name: contact.contactPerson || '',
      role: contact.role || '',
      phone: formatPhoneNumber(contact.phone),
      primary: true,
    });
  }
  if (contact.phone2) {
    people.push({ name: 'Secondary contact', role: '', phone: formatPhoneNumber(contact.phone2), primary: false });
  }
  return people;
};

const personKey = (person) => {
  const phone = phoneDigits(person.phone);
  if (phone) return `phone:${phone}`;
  return `person:${String(person.name || '').trim().toLocaleLowerCase()}|${String(person.role || '').trim().toLocaleLowerCase()}`;
};

const createSchool = (name, schoolId = null) => ({
  key: schoolId ? `id:${schoolId}` : `name:${normalizeSchoolName(name)}`,
  schoolId,
  name: canonicalSchoolName(name),
  note: '',
  contactDocuments: [],
  people: [],
  seminars: [],
});

export const buildSchoolDirectory = ({ contacts = [], seminars = [], schoolRecords = [] } = {}) => {
  const schools = [];
  const byId = new Map();
  const byName = new Map();

  const ensureSchool = (name, schoolId = null) => {
    const normalizedName = normalizeSchoolName(name);
    if (!normalizedName && !schoolId) return null;

    let school = schoolId ? byId.get(String(schoolId)) : null;
    if (!school && normalizedName) school = byName.get(normalizedName);

    if (!school) {
      school = createSchool(name, schoolId ? String(schoolId) : null);
      schools.push(school);
    }

    if (schoolId && !school.schoolId) {
      school.schoolId = String(schoolId);
      school.key = `id:${school.schoolId}`;
    }
    if (schoolId) byId.set(String(schoolId), school);
    if (school.schoolId) byId.set(school.schoolId, school);
    if (normalizedName) byName.set(normalizedName, school);
    if (!school.name && name) school.name = canonicalSchoolName(name);
    return school;
  };

  schoolRecords
    .filter(record => !record.archived && record.name)
    .forEach(record => {
      const legacyNameDocument = !record.schoolId && String(record.id) === String(record.name);
      const school = ensureSchool(record.name, record.schoolId || (legacyNameDocument ? null : record.id));
      if (!school) return;
      school.name = canonicalSchoolName(record.name);
      school.note = record.note || school.note;
      school.schoolRecord = record;
      byName.set(normalizeSchoolName(school.name), school);
    });

  contacts
    .filter(contact => !contact.archived)
    .forEach(contact => {
      const school = ensureSchool(contact.schoolName, contact.schoolId);
      if (!school) return;
      school.contactDocuments.push(contact);
      const knownPeople = new Set(school.people.map(personKey));
      peopleForContact(contact).forEach(person => {
        const key = personKey(person);
        if (!knownPeople.has(key)) {
          knownPeople.add(key);
          school.people.push(person);
        }
      });
    });

  seminars.forEach(seminar => {
    const school = ensureSchool(seminar.school, seminar.schoolId);
    if (!school) return;
    if (!school.seminars.some(item => String(item.id) === String(seminar.id))) school.seminars.push(seminar);
  });

  return schools
    .filter(school => school.name)
    .map(school => ({
      ...school,
      contactCount: school.people.length,
      seminarCount: school.seminars.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const recordMatchesSchool = (recordSchoolId, recordName, school) => {
  if (!school) return false;
  if (recordSchoolId && school.schoolId && String(recordSchoolId) === String(school.schoolId)) return true;
  return normalizeSchoolName(recordName) === normalizeSchoolName(school.name);
};
