import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserAccess from '../../src/components/UserAccess';
import { AppContext } from '../../src/context/AppContext';

const firestore = vi.hoisted(() => ({
  commit: vi.fn(),
  delete: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../src/config/firestore', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_database, name) => ({ path: name })),
  doc: vi.fn((reference, ...parts) => parts.length
    ? { path: parts.join('/') }
    : { path: `${reference.path}/generated-activity` }),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  writeBatch: vi.fn(() => firestore),
}));

const profiles = [
  { id: 'active-user', name: 'Active User', email: 'active@example.com', role: 'editor', approved: true },
  { id: 'blocked-user', name: 'Blocked User', email: 'blocked@example.com', role: 'viewer', approved: false },
];

const renderAccess = (overrides = {}) => render(
  <AppContext.Provider value={{
    canManageUsers: true,
    user: { uid: 'admin-user', displayName: 'Portal Admin', email: 'admin@example.com' },
    userProfiles: profiles,
    userProfilesError: '',
    hasMoreUserProfiles: false,
    loadMoreUserProfiles: vi.fn(),
    ...overrides,
  }}>
    <UserAccess />
  </AppContext.Provider>,
);

describe('UserAccess permissions', () => {
  beforeEach(() => {
    firestore.commit.mockReset().mockResolvedValue(undefined);
    firestore.delete.mockReset();
    firestore.set.mockReset();
    firestore.update.mockReset();
  });

  it('stays hidden when the current role cannot manage users', () => {
    renderAccess({ canManageUsers: false });
    expect(screen.queryByRole('heading', { name: 'User access' })).not.toBeInTheDocument();
  });

  it('offers Co-Admin as a role but only offers removal for blocked users', () => {
    renderAccess();
    expect(screen.getAllByRole('option', { name: 'Co-Admin' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /block/i })).toHaveLength(2);
  });

  it('removes a blocked profile and writes its permanent deny marker atomically', async () => {
    const user = userEvent.setup();
    renderAccess();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Remove this blocked user?');
    expect(screen.getByText(/remain permanently blocked/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove user' }));

    await waitFor(() => expect(firestore.commit).toHaveBeenCalledOnce());
    expect(firestore.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'removedUsers/blocked-user' }),
      expect.objectContaining({ uid: 'blocked-user', email: 'blocked@example.com' }),
    );
    expect(firestore.delete).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/blocked-user' }));
  });
});
