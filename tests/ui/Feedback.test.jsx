import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../src/components/ConfirmDialog';
import ToastRegion from '../../src/components/ToastRegion';

describe('Feedback components', () => {
  it('confirms or cancels a destructive action without a browser dialog', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Delete this school?" message="This cannot be undone." confirmLabel="Delete school" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Delete this school?');
    await user.click(screen.getByRole('button', { name: 'Delete school' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('announces and dismisses toast errors', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ToastRegion notices={[{ id: 7, type: 'error', message: 'The record could not be saved.' }]} onDismiss={onDismiss} />);

    expect(screen.getByRole('alert')).toHaveTextContent('The record could not be saved.');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
