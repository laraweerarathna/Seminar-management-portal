import React, { useContext, useMemo, useState } from 'react';
import { Check, ShieldCheck, Trash2, UserRoundCheck, UserRoundX, UsersRound } from 'lucide-react';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { AppContext } from '../context/AppContext';
import { db } from '../config/firebase';
import ConfirmDialog from './ConfirmDialog';

const roles = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'co_admin', label: 'Co-Admin' },
  { value: 'admin', label: 'Admin' },
];

const dateLabel = (value) => {
  if (!value?.toDate) return 'Has not signed in recently';
  return `Last seen ${value.toDate().toLocaleString()}`;
};

export default function UserAccess() {
  const { canManageUsers, user, userProfiles, userProfilesError, hasMoreUserProfiles, loadMoreUserProfiles } = useContext(AppContext);
  const [busyUserId, setBusyUserId] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const counts = useMemo(() => ({
    blocked: userProfiles.filter(profile => !profile.approved).length,
    active: userProfiles.filter(profile => profile.approved).length,
  }), [userProfiles]);

  if (!canManageUsers) return null;

  const updateAccess = async (profile, changes, action) => {
    if (busyUserId || !canManageUsers) return;
    const isSelf = profile.id === user.uid;
    const nextRole = changes.role ?? profile.role;
    const nextApproval = changes.approved ?? profile.approved;
    if (isSelf && (nextRole !== 'admin' || nextApproval !== true)) {
      setFeedback({ type: 'error', text: 'Your own administrator access is protected.' });
      return;
    }

    setBusyUserId(profile.id);
    setFeedback(null);
    try {
      const actor = user.displayName || user.email || 'Portal administrator';
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', profile.id), {
        ...changes,
        accessUpdatedAt: serverTimestamp(),
        accessUpdatedByUid: user.uid,
        accessUpdatedBy: actor,
      });
      batch.set(doc(collection(db, 'adminActivities')), {
        entityType: 'user',
        entityId: profile.id,
        action,
        label: profile.name || profile.email || 'Portal account',
        createdAt: serverTimestamp(),
        user: actor,
        userUid: user.uid,
      });
      await batch.commit();
      setFeedback({ type: 'success', text: `${profile.name || profile.email || 'Account'} updated.` });
    } catch (error) {
      console.error('Unable to update user access:', error);
      setFeedback({ type: 'error', text: 'Access could not be updated. Check your connection and published Firestore rules.' });
    } finally {
      setBusyUserId('');
    }
  };

  const removeBlockedUser = async (profile) => {
    if (busyUserId || !canManageUsers) return;
    if (profile.approved) {
      setFeedback({ type: 'error', text: 'Block this account before removing it from the user list.' });
      return;
    }

    setBusyUserId(profile.id);
    setFeedback(null);
    try {
      const actor = user.displayName || user.email || 'Portal administrator';
      const batch = writeBatch(db);
      batch.set(doc(db, 'removedUsers', profile.id), {
        uid: profile.id,
        email: profile.email || '',
        name: profile.name || profile.email || 'Removed portal account',
        removedAt: serverTimestamp(),
        removedByUid: user.uid,
        removedBy: actor,
      });
      batch.delete(doc(db, 'users', profile.id));
      batch.set(doc(collection(db, 'adminActivities')), {
        entityType: 'user',
        entityId: profile.id,
        action: 'removed blocked account from user list',
        label: profile.name || profile.email || 'Portal account',
        createdAt: serverTimestamp(),
        user: actor,
        userUid: user.uid,
      });
      await batch.commit();
      setFeedback({ type: 'success', text: `${profile.name || profile.email || 'Account'} removed from the user list and remains blocked.` });
    } catch (error) {
      console.error('Unable to remove blocked user:', error);
      setFeedback({ type: 'error', text: 'The blocked account could not be removed. Check your connection and published Firestore rules.' });
    } finally {
      setBusyUserId('');
    }
  };

  const changeRole = (profile, nextRole) => {
    if (nextRole === profile.role) return;
    if (['co_admin', 'admin'].includes(nextRole)) {
      setPendingConfirmation({ type: 'role', profile, nextRole });
      return;
    }
    updateAccess(profile, { role: nextRole, approved: profile.approved }, `role changed to ${nextRole}`);
  };

  const toggleAccess = (profile) => {
    if (profile.approved) {
      setPendingConfirmation({ type: 'block', profile });
      return;
    }
    updateAccess(
      profile,
      { approved: !profile.approved },
      profile.approved ? 'access blocked' : `access restored as ${profile.role}`,
    );
  };

  const confirmPendingAction = async () => {
    if (!pendingConfirmation) return;
    const { profile, type, nextRole } = pendingConfirmation;
    if (type === 'role') {
      await updateAccess(profile, { role: nextRole, approved: profile.approved }, `role changed to ${nextRole}`);
    } else if (type === 'remove') {
      await removeBlockedUser(profile);
    } else {
      await updateAccess(profile, { approved: false }, 'access blocked');
    }
    setPendingConfirmation(null);
  };

  const confirmationName = pendingConfirmation?.profile?.name || pendingConfirmation?.profile?.email || 'this user';
  const confirmationIsRole = pendingConfirmation?.type === 'role';
  const confirmationIsRemoval = pendingConfirmation?.type === 'remove';
  const confirmationIsAdmin = pendingConfirmation?.nextRole === 'admin';
  const confirmationTitle = confirmationIsRemoval ? 'Remove this blocked user?' : confirmationIsRole ? `Grant ${confirmationIsAdmin ? 'Admin' : 'Co-Admin'} access?` : 'Block this account?';
  const confirmationMessage = confirmationIsRemoval
    ? `${confirmationName} will disappear from the user list but remain permanently blocked from the portal. This cannot be undone from the portal.`
    : confirmationIsRole
      ? confirmationIsAdmin
        ? `${confirmationName} will be able to delete records, manage users and roles, block accounts, and download full backups.`
        : `${confirmationName} will be able to create, update, and delete operational records and download full backups, but cannot manage users.`
      : `${confirmationName} will immediately lose access to all portal data until an administrator restores it.`;
  const confirmationLabel = confirmationIsRemoval ? 'Remove user' : confirmationIsRole ? `Grant ${confirmationIsAdmin ? 'Admin' : 'Co-Admin'}` : 'Block account';

  return (
    <>
      <section className="access-panel" aria-labelledby="user-access-title">
      <header className="access-header">
        <div>
          <span className="eyebrow accent">Administrator only</span>
          <h2 id="user-access-title"><UsersRound size={21} />User access</h2>
          <p>All new Google accounts start as viewers. Assign roles, block accounts, or remove an already-blocked user when needed.</p>
        </div>
        <div className="access-counts" aria-label={`${counts.blocked} blocked and ${counts.active} active accounts`}>
          <span className={counts.blocked ? 'has-blocked' : ''}>{counts.blocked} blocked</span>
          <span>{counts.active} active</span>
        </div>
      </header>

      {feedback && <p className={`access-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.type === 'success' && <Check size={15} />}{feedback.text}</p>}
      {userProfilesError && <p className="access-feedback error" role="alert">{userProfilesError}</p>}

      <div className="access-list">
        {userProfiles.map(profile => {
          const isSelf = profile.id === user.uid;
          const isBusy = busyUserId === profile.id;
          return (
            <article className="access-row" key={profile.id}>
              <div className="access-avatar" aria-hidden="true">{String(profile.name || profile.email || '?').slice(0, 1).toUpperCase()}</div>
              <div className="access-identity">
                <div><strong>{profile.name || 'Unnamed account'}</strong>{isSelf && <span className="self-badge"><ShieldCheck size={12} />You</span>}</div>
                <span>{profile.email || 'No email recorded'}</span>
                <small>{dateLabel(profile.lastSeenAt)}</small>
              </div>
              <span className={`access-status ${profile.approved ? 'active' : 'blocked'}`}>{profile.approved ? 'Active' : 'Blocked'}</span>
              <label className="role-control">
                <span className="sr-only">Role for {profile.name || profile.email}</span>
                <select value={profile.role} disabled={isBusy || isSelf} onChange={event => changeRole(profile, event.target.value)}>
                  {roles.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              {isSelf ? (
                <span className="protected-access"><ShieldCheck size={16} />Protected</span>
              ) : (
                <div className="access-actions">
                  <button className={`btn ${profile.approved ? 'btn-secondary block-button' : 'btn-primary'}`} disabled={isBusy} onClick={() => toggleAccess(profile)}>
                    {profile.approved ? <UserRoundX size={16} /> : <UserRoundCheck size={16} />}
                    {isBusy ? 'Saving…' : profile.approved ? 'Block' : 'Unblock'}
                  </button>
                  {!profile.approved && <button className="btn btn-secondary remove-user-button" disabled={isBusy} onClick={() => setPendingConfirmation({ type: 'remove', profile })}><Trash2 size={16} />Remove</button>}
                </div>
              )}
            </article>
          );
        })}
        {!userProfiles.length && !userProfilesError && <div className="empty-state"><UsersRound size={27} /><h3>No account profiles found</h3><p>New users appear here after their first Google sign-in.</p></div>}
      </div>
      {hasMoreUserProfiles && <div className="load-more-row"><span>Showing the first {userProfiles.length} accounts.</span><button type="button" className="btn btn-secondary" onClick={loadMoreUserProfiles}>Load more users</button></div>}
      </section>
      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={confirmationTitle}
        message={confirmationMessage}
        confirmLabel={confirmationLabel}
        busy={Boolean(pendingConfirmation && busyUserId === pendingConfirmation.profile.id)}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmPendingAction}
      />
    </>
  );
}
