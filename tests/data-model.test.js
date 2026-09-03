import test from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendarLink } from '../src/utils/calendar.js';
import { buildSchoolDirectory } from '../src/utils/schools.js';
import { formatPhoneInput, formatPhoneNumber, isValidPhoneNumber, phoneLink } from '../src/utils/phone.js';

test('legacy contact documents are grouped into one school', () => {
  const schools = buildSchoolDirectory({
    contacts: [
      { id: '1', schoolName: 'Example School', contactPerson: 'Principal', phone: '0711111111' },
      { id: '2', schoolName: 'Example  School', contactPerson: 'Teacher', phone: '0722222222' },
    ],
    seminars: [{ id: 'seminar-1', school: 'Example School' }],
  });

  assert.equal(schools.length, 1);
  assert.equal(schools[0].contactCount, 2);
  assert.equal(schools[0].seminarCount, 1);
});

test('stable school IDs keep renamed records connected', () => {
  const schools = buildSchoolDirectory({
    schoolRecords: [{ id: 'school-1', schoolId: 'school-1', name: 'New School Name' }],
    contacts: [{ id: 'contact-1', schoolId: 'school-1', schoolName: 'Old School Name', people: [] }],
    seminars: [{ id: 'seminar-1', schoolId: 'school-1', school: 'Old School Name' }],
  });

  assert.equal(schools.length, 1);
  assert.equal(schools[0].schoolId, 'school-1');
  assert.equal(schools[0].name, 'New School Name');
  assert.equal(schools[0].seminarCount, 1);
});

test('known legacy spelling is joined to the canonical school', () => {
  const schools = buildSchoolDirectory({
    contacts: [{ id: '1', schoolName: 'Deeyakaduwa Vidyartha Kanishta Vidyalaya', people: [] }],
    seminars: [{ id: '1', school: 'Diyakaduwa Vidyartha Kanishta Vidyalaya' }],
  });

  assert.equal(schools.length, 1);
  assert.equal(schools[0].name, 'Diyakaduwa Vidyartha Kanishta Vidyalaya');
});

test('a school remains in the directory without contacts', () => {
  const schools = buildSchoolDirectory({
    contacts: [{ id: 'school-1', schoolId: 'school-1', schoolName: 'No Contact School', people: [] }],
  });

  assert.equal(schools.length, 1);
  assert.equal(schools[0].contactCount, 0);
});

test('contact numbers use one local display and storage format', () => {
  assert.equal(formatPhoneNumber('0707424702'), '070 742 4702');
  assert.equal(formatPhoneNumber('070-742-4702'), '070 742 4702');
  assert.equal(formatPhoneInput('070742470299'), '070 742 4702');
  assert.equal(isValidPhoneNumber('070 742 4702'), true);
  assert.equal(isValidPhoneNumber('070742470'), false);
  assert.equal(phoneLink('070 742 4702'), 'tel:0707424702');
});

test('legacy contact numbers are normalized while building the directory', () => {
  const schools = buildSchoolDirectory({
    contacts: [{ id: '1', schoolName: 'Example School', contactPerson: 'Principal', phone: '0707424702' }],
  });

  assert.equal(schools[0].people[0].phone, '070 742 4702');
});

test('Google Calendar link uses a valid Colombo local timestamp', () => {
  const link = googleCalendarLink({
    title: 'Seminar Program',
    school: 'Example School',
    startTime: '07:30',
    endTime: '15:00',
  }, '2026-09-02');

  assert.match(link, /dates=20260902T073000\/20260902T150000/);
  assert.match(link, /ctz=Asia%2FColombo/);
  assert.doesNotMatch(link, /\+0530Z/);
});
