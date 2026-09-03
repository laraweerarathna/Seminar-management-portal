import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../../src/components/Layout';
import { AppContext } from '../../src/context/AppContext';

const contextFor = (overrides = {}) => ({
  user: { uid: 'viewer-1', email: 'viewer@example.com', displayName: 'Portal Viewer' },
  role: 'viewer',
  approved: true,
  authReady: true,
  dataLoading: false,
  dataError: '',
  signingIn: false,
  userProfiles: [],
  hasMoreData: { seminars: false, contacts: false, schools: false },
  loadingMoreData: false,
  notices: [],
  signIn: vi.fn(),
  logOut: vi.fn(),
  loadMoreData: vi.fn(),
  dismissNotice: vi.fn(),
  ...overrides,
});

const renderLayout = (context) => render(
  <AppContext.Provider value={context}>
    <MemoryRouter initialEntries={['/']}>
      <Routes><Route path="/" element={<Layout />}><Route index element={<p>Portal content</p>} /></Route></Routes>
    </MemoryRouter>
  </AppContext.Provider>,
);

describe('Layout access and progressive loading', () => {
  it('keeps the admin tab hidden from viewers', () => {
    renderLayout(contextFor());
    expect(screen.getByText('Portal content')).toBeInTheDocument();
    expect(screen.queryByText('Admin control')).not.toBeInTheDocument();
  });

  it('keeps the admin tab hidden from co-admins', () => {
    renderLayout(contextFor({ role: 'co_admin' }));
    expect(screen.queryByText('Admin control')).not.toBeInTheDocument();
  });

  it('shows the admin tab only to administrators', () => {
    renderLayout(contextFor({ role: 'admin' }));
    expect(screen.getByText('Admin control')).toBeInTheDocument();
  });

  it('lets users request the next bounded data page', async () => {
    const user = userEvent.setup();
    const loadMoreData = vi.fn();
    renderLayout(contextFor({ hasMoreData: { seminars: true, contacts: false, schools: true }, loadMoreData }));

    expect(screen.getByText('More records are available.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more records' }));
    expect(loadMoreData).toHaveBeenCalledOnce();
  });

  it('keeps portal content available while the latest data syncs', () => {
    renderLayout(contextFor({ dataLoading: true }));

    expect(screen.getByText('Portal content')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Syncing the latest records');
  });
});
