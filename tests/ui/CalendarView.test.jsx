import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addMonths, format } from 'date-fns';
import CalendarView from '../../src/components/CalendarView';
import { AppContext } from '../../src/context/AppContext';

describe('CalendarView', () => {
  it('navigates months and reveals a selected day', async () => {
    const user = userEvent.setup();
    render(<AppContext.Provider value={{ seminars: [] }}><CalendarView /></AppContext.Provider>);

    const thisMonth = format(new Date(), 'MMMM yyyy');
    const nextMonth = format(addMonths(new Date(), 1), 'MMMM yyyy');
    expect(screen.getAllByText(thisMonth).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getAllByText(nextMonth).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /no seminars/i })[0]);
    expect(screen.getByText('0 seminars scheduled')).toBeInTheDocument();
  });
});
