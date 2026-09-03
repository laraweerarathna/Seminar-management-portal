import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isToday, isSameDay, addMonths, subMonths
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarPlus, Map } from 'lucide-react';
import { googleCalendarLink } from '../utils/calendar';
import PageHeader from './PageHeader';

const seminarStatus = (seminar) => seminar.status === 'upcoming' ? 'confirmed' : seminar.status || 'draft';
const statusLabel = (seminar) => ({ draft: 'Draft', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }[seminarStatus(seminar)]);

export default function CalendarView() {
  const { seminars } = useContext(AppContext);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const seminarsByDate = useMemo(() => {
    const map = {};
    seminars.filter(seminar => seminarStatus(seminar) !== 'cancelled').forEach(seminar => {
      if (seminar.date1) {
        if (!map[seminar.date1]) map[seminar.date1] = [];
        map[seminar.date1].push(seminar);
      }
      if (seminar.date2) {
        if (!map[seminar.date2]) map[seminar.date2] = [];
        map[seminar.date2].push(seminar);
      }
    });
    return map;
  }, [seminars]);

  const showMonth = (date) => {
    setCurrentDate(date);
    setSelectedDate(null);
  };
  const handlePrevMonth = () => showMonth(subMonths(currentDate, 1));
  const handleNextMonth = () => showMonth(addMonths(currentDate, 1));

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(parseInt(h, 10));
    d.setMinutes(parseInt(m, 10));
    return format(d, 'h:mm a');
  };

  const selectedSeminars = selectedDate 
    ? seminarsByDate[format(selectedDate, 'yyyy-MM-dd')] || []
    : [];

  return (
    <div className="page calendar-page animate-fade-in">
      <PageHeader eyebrow="Seminar planning" title="Schedule" description="Browse the monthly plan and open any date to review its seminar details.">
        <div className="calendar-month-nav" aria-label="Calendar month navigation">
          <button className="icon-action calendar-nav-button" onClick={handlePrevMonth} aria-label="Previous month"><ChevronLeft size={20} /></button>
          <div className="calendar-month-label"><span>Viewing</span><strong>{format(currentDate, 'MMMM yyyy')}</strong></div>
          <button className="icon-action calendar-nav-button" onClick={handleNextMonth} aria-label="Next month"><ChevronRight size={20} /></button>
        </div>
      </PageHeader>

      <div className="calendar-layout">
        <section className="content-section calendar-panel" aria-label={`${format(currentDate, 'MMMM yyyy')} calendar`}>
          <div className="calendar-weekdays" aria-hidden="true">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-days">
            {Array.from({ length: startOfMonth(currentDate).getDay() }).map((_, index) => <span className="calendar-day-empty" key={`empty-${index}`} />)}
            {daysInMonth.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const daySeminars = seminarsByDate[dateKey] || [];
              const hasSeminars = daySeminars.length > 0;
              const selected = Boolean(selectedDate && isSameDay(day, selectedDate));
              const today = isToday(day);
              const className = ['calendar-day', hasSeminars && 'has-events', selected && 'selected', today && 'today'].filter(Boolean).join(' ');

              return (
                <button
                  type="button"
                  key={dateKey}
                  className={className}
                  onClick={() => setSelectedDate(day)}
                  aria-label={`${format(day, 'MMMM do, yyyy')}${hasSeminars ? `, ${daySeminars.length} seminar${daySeminars.length === 1 ? '' : 's'}` : ', no seminars'}`}
                  aria-pressed={selected}
                >
                  <span className="calendar-day-number">{format(day, 'd')}</span>
                  {today && <span className="calendar-today-label">Today</span>}
                  {hasSeminars && <span className="calendar-event-count">{daySeminars.length}<span className="sr-only"> seminars</span></span>}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="content-section calendar-details">
          <div className="calendar-details-heading">
            <span className="eyebrow accent">Day details</span>
            <h2>{selectedDate ? format(selectedDate, 'MMMM do, yyyy') : 'Select a date'}</h2>
            <p>{selectedDate ? `${selectedSeminars.length} seminar${selectedSeminars.length === 1 ? '' : 's'} scheduled` : 'Choose a day from the calendar to see its schedule.'}</p>
          </div>

          {selectedDate && selectedSeminars.length > 0 ? (
            <div className="calendar-events">
              {selectedSeminars.map(seminar => (
                <article className="calendar-event-card" key={seminar.id}>
                  <div className="calendar-event-heading">
                    <h3>{seminar.school}</h3>
                    <span className={`status-pill ${seminarStatus(seminar)}`}>{statusLabel(seminar)}</span>
                  </div>
                  <p>{seminar.title}</p>
                  <strong className="calendar-event-time">{formatTime(seminar.startTime)} – {formatTime(seminar.endTime)}</strong>
                  <div className="calendar-grade-list">
                    {seminar.grade10 && <span className="grade-pill">Grade 10</span>}
                    {seminar.grade11 && <span className="grade-pill">Grade 11</span>}
                  </div>
                  <div className="calendar-event-actions">
                    {seminar.locationLink && <a href={seminar.locationLink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><Map size={16} />View on map</a>}
                    {seminar.date1 && <a href={googleCalendarLink(seminar, seminar.date1)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><CalendarPlus size={16} />{seminar.date2 ? 'Add day 1 to calendar' : 'Add to calendar'}</a>}
                    {seminar.date2 && <a href={googleCalendarLink(seminar, seminar.date2)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><CalendarPlus size={16} />Add day 2 to calendar</a>}
                  </div>
                </article>
              ))}
            </div>
          ) : selectedDate ? (
            <div className="empty-state calendar-empty"><CalendarPlus size={27} /><h3>No seminars scheduled</h3><p>This day is currently open.</p></div>
          ) : (
            <div className="empty-state calendar-empty"><CalendarPlus size={27} /><h3>No date selected</h3><p>Choose a highlighted date to view seminar details.</p></div>
          )}
        </aside>
      </div>
    </div>
  );
}
