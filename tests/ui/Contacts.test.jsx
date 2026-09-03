import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Contacts from '../../src/components/Contacts';
import { AppContext } from '../../src/context/AppContext';

const firestore = vi.hoisted(() => ({
  commit: vi.fn(),
  delete: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../src/config/firestore', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_database, name) => ({ name })),
  doc: vi.fn((...parts) => ({ id: parts.length === 1 ? 'new-school-id' : String(parts.at(-1)), parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  writeBatch: vi.fn(() => firestore),
}));

const renderContacts = (notify = vi.fn()) => render(
  <AppContext.Provider value={{
    contacts: [],
    seminars: [],
    schoolNotes: [],
    user: { uid: 'editor-1', displayName: 'Portal Editor', email: 'editor@example.com' },
    canEdit: true,
    canDelete: true,
    notify,
  }}>
    <Contacts />
  </AppContext.Provider>,
);

describe('Contacts form feedback', () => {
  beforeEach(() => {
    firestore.commit.mockReset().mockResolvedValue(undefined);
    firestore.delete.mockReset();
    firestore.set.mockReset();
    firestore.update.mockReset();
  });

  it('shows an inline error for a missing school name', async () => {
    const user = userEvent.setup();
    renderContacts();
    await user.click(screen.getByRole('button', { name: 'Add school' }));
    await user.click(screen.getByRole('button', { name: 'Save school' }));

    expect(screen.getByText('Enter a school name.')).toBeInTheDocument();
    expect(screen.getByLabelText('School name')).toHaveAttribute('aria-invalid', 'true');
    expect(firestore.commit).not.toHaveBeenCalled();
  });

  it('saves a school without requiring contact information', async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    renderContacts(notify);
    await user.click(screen.getByRole('button', { name: 'Add school' }));
    await user.type(screen.getByLabelText('School name'), 'New College');
    await user.click(screen.getByRole('button', { name: 'Save school' }));

    await waitFor(() => expect(firestore.commit).toHaveBeenCalledOnce());
    expect(firestore.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ schoolName: 'New College', people: [] }));
    expect(notify).toHaveBeenCalledWith('New College added successfully.');
  });

  it('formats and stores new phone numbers as XXX XXX XXXX', async () => {
    const user = userEvent.setup();
    renderContacts();
    await user.click(screen.getByRole('button', { name: 'Add school' }));
    await user.type(screen.getByLabelText('School name'), 'Number Format College');
    await user.click(screen.getByRole('button', { name: 'Add contact person' }));
    await user.type(screen.getByLabelText('Name'), 'Principal');
    await user.type(screen.getByLabelText('Phone number'), '0707424702');

    expect(screen.getByLabelText('Phone number')).toHaveValue('070 742 4702');
    await user.click(screen.getByRole('button', { name: 'Save school' }));

    await waitFor(() => expect(firestore.commit).toHaveBeenCalledOnce());
    expect(firestore.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        people: [expect.objectContaining({ phone: '070 742 4702' })],
      }),
    );
  });
});
