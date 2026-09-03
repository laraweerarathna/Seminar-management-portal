import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const projectId = 'demo-seminar-portal-rules';
const profiles = {
  viewer: { email: 'viewer@example.com', name: 'Portal Viewer', photoURL: '', role: 'viewer', approved: true },
  blocked: { email: 'blocked@example.com', name: 'Blocked User', photoURL: '', role: 'viewer', approved: false },
  editor: { email: 'editor@example.com', name: 'Portal Editor', photoURL: '', role: 'editor', approved: true },
  coAdmin: { email: 'co-admin@example.com', name: 'Portal Co-Admin', photoURL: '', role: 'co_admin', approved: true },
  admin: { email: 'admin@example.com', name: 'Portal Admin', photoURL: '', role: 'admin', approved: true },
  legacyViewer: { email: 'legacy-viewer@example.com', name: 'Legacy Viewer', photoURL: '', role: 'viewer' },
  legacyAdmin: { email: 'legacy-admin@example.com', name: 'Legacy Admin', photoURL: '', role: 'admin' },
};

let testEnvironment;

const signedInDatabase = (uid) => testEnvironment.authenticatedContext(uid, {
  email: profiles[uid]?.email || `${uid}@example.com`,
  email_verified: true,
}).firestore();

const accessAuditFields = (actor = 'admin') => ({
  accessUpdatedAt: serverTimestamp(),
  accessUpdatedByUid: actor,
  accessUpdatedBy: profiles[actor]?.name || actor,
});

const removedUserFields = (target = 'blocked', actor = 'admin') => ({
  uid: target,
  email: profiles[target].email,
  name: profiles[target].name,
  removedAt: serverTimestamp(),
  removedByUid: actor,
  removedBy: profiles[actor].name,
});

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    const createdAt = Timestamp.fromDate(new Date('2026-09-03T00:00:00Z'));
    await Promise.all([
      ...Object.entries(profiles).map(([uid, profile]) => setDoc(doc(database, 'users', uid), {
        ...profile,
        createdAt,
        lastSeenAt: createdAt,
      })),
      setDoc(doc(database, 'seminars', 'seminar-1'), { title: 'Mathematics', school: 'Example School' }),
      setDoc(doc(database, 'activities', 'activity-1'), {
        entityType: 'seminar',
        entityId: 'seminar-1',
        action: 'created',
        label: 'Example School — Mathematics',
        createdAt,
        user: profiles.editor.name,
        userUid: 'editor',
      }),
      setDoc(doc(database, 'adminActivities', 'admin-activity-1'), {
        entityType: 'user',
        entityId: 'blocked',
        action: 'access blocked',
        label: profiles.blocked.name,
        createdAt,
        user: profiles.admin.name,
        userUid: 'admin',
      }),
    ]);
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('signed-out and blocked accounts cannot read portal data', async () => {
  const signedOut = testEnvironment.unauthenticatedContext().firestore();
  const blocked = signedInDatabase('blocked');

  await assertFails(getDoc(doc(signedOut, 'seminars', 'seminar-1')));
  await assertFails(getDoc(doc(blocked, 'seminars', 'seminar-1')));
  await assertSucceeds(getDoc(doc(blocked, 'users', 'blocked')));
  await assertFails(getDocs(collection(blocked, 'users')));
});

test('viewer can read data but cannot change it', async () => {
  const viewer = signedInDatabase('viewer');

  await assertSucceeds(getDoc(doc(viewer, 'seminars', 'seminar-1')));
  await assertFails(setDoc(doc(viewer, 'seminars', 'seminar-2'), { title: 'Science' }));
  await assertFails(updateDoc(doc(viewer, 'seminars', 'seminar-1'), { title: 'Changed' }));
  await assertFails(deleteDoc(doc(viewer, 'seminars', 'seminar-1')));
});

test('editor can create and update records but cannot delete them', async () => {
  const editor = signedInDatabase('editor');

  await assertSucceeds(setDoc(doc(editor, 'seminars', 'seminar-2'), { title: 'Science' }));
  await assertSucceeds(updateDoc(doc(editor, 'seminars', 'seminar-1'), { title: 'Advanced Mathematics' }));
  await assertFails(deleteDoc(doc(editor, 'seminars', 'seminar-1')));
});

test('co-admin can manage operational records but cannot manage users', async () => {
  const coAdmin = signedInDatabase('coAdmin');

  await assertSucceeds(setDoc(doc(coAdmin, 'seminars', 'seminar-2'), { title: 'Science' }));
  await assertSucceeds(updateDoc(doc(coAdmin, 'seminars', 'seminar-1'), { title: 'Advanced Mathematics' }));
  await assertSucceeds(deleteDoc(doc(coAdmin, 'seminars', 'seminar-1')));
  await assertFails(getDocs(collection(coAdmin, 'users')));
  await assertFails(updateDoc(doc(coAdmin, 'users', 'blocked'), {
    approved: true,
    ...accessAuditFields('coAdmin'),
  }));

  const removal = writeBatch(coAdmin);
  removal.set(doc(coAdmin, 'removedUsers', 'blocked'), removedUserFields('blocked', 'coAdmin'));
  removal.delete(doc(coAdmin, 'users', 'blocked'));
  await assertFails(removal.commit());
});

test('administrator can list users and delete portal records', async () => {
  const admin = signedInDatabase('admin');

  await assertSucceeds(getDocs(collection(admin, 'users')));
  await assertSucceeds(deleteDoc(doc(admin, 'seminars', 'seminar-1')));
});

test('a verified user can only create their own active viewer profile', async () => {
  const newcomer = signedInDatabase('newcomer');
  await assertSucceeds(setDoc(doc(newcomer, 'users', 'newcomer'), {
    email: 'newcomer@example.com',
    name: 'New User',
    photoURL: '',
    role: 'viewer',
    approved: true,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }));
  await assertSucceeds(getDoc(doc(newcomer, 'seminars', 'seminar-1')));

  const blockedOnArrival = signedInDatabase('blocked-on-arrival');
  await assertFails(setDoc(doc(blockedOnArrival, 'users', 'blocked-on-arrival'), {
    email: 'blocked-on-arrival@example.com',
    name: 'Blocked On Arrival',
    photoURL: '',
    role: 'viewer',
    approved: false,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }));

  const editorOnArrival = signedInDatabase('editor-on-arrival');
  await assertFails(setDoc(doc(editorOnArrival, 'users', 'editor-on-arrival'), {
    email: 'editor-on-arrival@example.com',
    name: 'Unapproved Editor',
    photoURL: '',
    role: 'editor',
    approved: true,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }));
});

test('blocked users can refresh profile details but cannot unblock or promote themselves', async () => {
  const blocked = signedInDatabase('blocked');

  await assertSucceeds(updateDoc(doc(blocked, 'users', 'blocked'), {
    email: profiles.blocked.email,
    name: 'Blocked User Updated',
    photoURL: '',
    lastSeenAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(blocked, 'users', 'blocked'), { approved: true }));
  await assertFails(updateDoc(doc(blocked, 'users', 'blocked'), { role: 'admin' }));
  await assertFails(updateDoc(doc(blocked, 'users', 'admin'), { approved: false }));
});

test('administrator can unblock, block, and assign roles to another account', async () => {
  const admin = signedInDatabase('admin');
  const blockedProfile = doc(admin, 'users', 'blocked');

  await assertSucceeds(updateDoc(blockedProfile, {
    approved: true,
    role: 'co_admin',
    ...accessAuditFields(),
  }));
  await assertSucceeds(updateDoc(blockedProfile, {
    approved: false,
    ...accessAuditFields(),
  }));
});

test('only an administrator can remove a blocked user while keeping the account denied', async () => {
  const admin = signedInDatabase('admin');
  const removal = writeBatch(admin);
  removal.set(doc(admin, 'removedUsers', 'blocked'), removedUserFields());
  removal.delete(doc(admin, 'users', 'blocked'));
  await assertSucceeds(removal.commit());

  assert.equal((await getDoc(doc(admin, 'users', 'blocked'))).exists(), false);
  assert.equal((await getDoc(doc(admin, 'removedUsers', 'blocked'))).exists(), true);

  const removedUser = signedInDatabase('blocked');
  await assertSucceeds(getDoc(doc(removedUser, 'removedUsers', 'blocked')));
  await assertFails(setDoc(doc(removedUser, 'users', 'blocked'), {
    ...profiles.blocked,
    approved: true,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(removedUser, 'seminars', 'seminar-1')));
});

test('an active user or a blocked user without a removal marker cannot be deleted', async () => {
  const admin = signedInDatabase('admin');

  await assertFails(deleteDoc(doc(admin, 'users', 'blocked')));
  const activeRemoval = writeBatch(admin);
  activeRemoval.set(doc(admin, 'removedUsers', 'viewer'), removedUserFields('viewer'));
  activeRemoval.delete(doc(admin, 'users', 'viewer'));
  await assertFails(activeRemoval.commit());
});

test('administrator cannot demote, block, or delete their own account', async () => {
  const admin = signedInDatabase('admin');
  const ownProfile = doc(admin, 'users', 'admin');

  await assertFails(updateDoc(ownProfile, { role: 'viewer', ...accessAuditFields() }));
  await assertFails(updateDoc(ownProfile, { approved: false, ...accessAuditFields() }));
  await assertFails(deleteDoc(ownProfile));
});

test('legacy profiles retain access and can migrate to an explicit access flag', async () => {
  const legacyViewer = signedInDatabase('legacyViewer');
  const legacyAdmin = signedInDatabase('legacyAdmin');

  await assertSucceeds(getDoc(doc(legacyViewer, 'seminars', 'seminar-1')));
  await assertSucceeds(updateDoc(doc(legacyViewer, 'users', 'legacyViewer'), { approved: true }));
  await assertSucceeds(getDoc(doc(legacyAdmin, 'seminars', 'seminar-1')));
  await assertSucceeds(updateDoc(doc(legacyAdmin, 'users', 'legacyAdmin'), {
    approved: true,
    ...accessAuditFields('legacyAdmin'),
  }));
});

test('activity history requires the real author and remains append-only', async () => {
  const editor = signedInDatabase('editor');
  const admin = signedInDatabase('admin');
  const validActivity = {
    entityType: 'seminar',
    entityId: 'seminar-2',
    action: 'created',
    label: 'Science seminar',
    createdAt: serverTimestamp(),
    user: profiles.editor.name,
    userUid: 'editor',
  };

  await assertSucceeds(setDoc(doc(editor, 'activities', 'activity-2'), validActivity));
  await assertFails(setDoc(doc(editor, 'activities', 'activity-3'), { ...validActivity, userUid: 'admin' }));
  await assertFails(setDoc(doc(editor, 'activities', 'activity-4'), { ...validActivity, entityType: 'user' }));
  await assertFails(updateDoc(doc(admin, 'activities', 'activity-1'), { action: 'rewritten' }));
  await assertFails(deleteDoc(doc(admin, 'activities', 'activity-1')));
});

test('administrator access audit is hidden from non-admins and append-only', async () => {
  const viewer = signedInDatabase('viewer');
  const editor = signedInDatabase('editor');
  const coAdmin = signedInDatabase('coAdmin');
  const admin = signedInDatabase('admin');
  const validAdminActivity = {
    entityType: 'user',
    entityId: 'blocked',
    action: 'role changed to editor',
    label: profiles.blocked.name,
    createdAt: serverTimestamp(),
    user: profiles.admin.name,
    userUid: 'admin',
  };

  await assertFails(getDocs(collection(viewer, 'adminActivities')));
  await assertFails(getDocs(collection(editor, 'adminActivities')));
  await assertFails(getDocs(collection(coAdmin, 'adminActivities')));
  await assertSucceeds(getDocs(collection(admin, 'adminActivities')));
  await assertFails(setDoc(doc(editor, 'adminActivities', 'admin-activity-2'), { ...validAdminActivity, userUid: 'editor' }));
  await assertSucceeds(setDoc(doc(admin, 'adminActivities', 'admin-activity-2'), validAdminActivity));
  await assertFails(updateDoc(doc(admin, 'adminActivities', 'admin-activity-1'), { action: 'rewritten' }));
  await assertFails(deleteDoc(doc(admin, 'adminActivities', 'admin-activity-1')));
});
