import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../../src/components/Dashboard';
import { AppContext } from '../../src/context/AppContext';

vi.mock('../../src/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ id: 'new-seminar-id' })),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
}));

describe('Dashboard seminar form', () => {
  it('keeps validation feedback beside missing fields', async () => {
    const user = userEvent.setup();
    render(
      <AppContext.Provider value={{
        seminars: [],
        contacts: [],
        schoolNotes: [{ id: 'school-1', schoolId: 'school-1', name: 'Test School' }],
        user: { uid: 'editor-1', displayName: 'Portal Editor' },
        canEdit: true,
        notify: vi.fn(),
      }}>
        <Dashboard />
      </AppContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add seminar' }));
    await user.click(screen.getByRole('button', { name: 'Save seminar' }));

    expect(screen.getByText('Select a school.')).toBeInTheDocument();
    expect(screen.getByText('Select a start date.')).toBeInTheDocument();
    expect(screen.getByLabelText('School')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Start date')).toHaveAttribute('aria-invalid', 'true');
  });
});
