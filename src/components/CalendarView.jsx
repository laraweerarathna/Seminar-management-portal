import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isToday, isSameDay, addMonths, subMonths, formatISO
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarPlus, Map } from 'lucide-react';

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
    seminars.forEach(seminar => {
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

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const generateGoogleCalendarLink = (seminar, targetDate) => {
    if (!targetDate) return '#';
    const startDate = new Date(`${targetDate}T${seminar.startTime}`);
    const endDate = new Date(`${targetDate}T${seminar.endTime}`);
    
    const formatForGCal = (date) => formatISO(date, { format: 'basic' }).replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const text = encodeURIComponent(seminar.title);
    const dates = `${formatForGCal(startDate)}/${formatForGCal(endDate)}`;
    const location = encodeURIComponent(seminar.school);
    const details = encodeURIComponent('Horana Subgroup Seminar');
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
  };

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
    <div className="animate-fade-in stack-on-mobile" style={{ display: 'flex', gap: '2rem', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className="stack-on-mobile" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h1>Calendar</h1>
            <p className="text-muted">Schedule overview</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary btn-icon" onClick={handlePrevMonth}>
              <ChevronLeft size={20} />
            </button>
            <h2 style={{ minWidth: '150px', textAlign: 'center', margin: 0 }}>
              {format(currentDate, 'MMMM yyyy')}
            </h2>
            <button className="btn btn-secondary btn-icon" onClick={handleNextMonth}>
              <ChevronRight size={20} />
            </button>
          </div>
        </header>

        <div className="glass-panel" style={{ padding: '1.5rem', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', gridAutoRows: '1fr' }}>
            {/* Empty slots for start of month alignment */}
            {Array.from({ length: startOfMonth(currentDate).getDay() }).map((_, i) => (
              <div key={`empty-${i}`} style={{ padding: '1rem', background: 'transparent' }} />
            ))}
            
            {daysInMonth.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const hasSeminars = !!seminarsByDate[dateKey];
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              
              let bg = 'rgba(255, 255, 255, 0.4)';
              let color = 'inherit';
              let border = '1px solid transparent';
              
              if (hasSeminars) {
                bg = 'var(--primary-color)';
                color = 'white';
              }
              if (isToday(day) && !hasSeminars) {
                border = `2px solid var(--primary-color)`;
              }
              if (isSelected) {
                border = `2px solid var(--secondary-color)`;
              }

              return (
                <div 
                  key={dateKey}
                  onClick={() => setSelectedDate(day)}
                  style={{
                    padding: '0.5rem',
                    minHeight: '80px',
                    borderRadius: 'var(--radius-md)',
                    background: bg,
                    color: color,
                    border: border,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    transition: 'transform 0.1s, box-shadow 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <span style={{ fontWeight: 600 }}>{format(day, 'd')}</span>
                  {hasSeminars && (
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white', alignSelf: 'center' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="glass-panel calendar-details" style={{ width: '350px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>
          {selectedDate ? format(selectedDate, 'MMMM do, yyyy') : 'Select a date'}
        </h2>
        
        {selectedDate ? (
          selectedSeminars.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
              {selectedSeminars.map(seminar => (
                <div key={seminar.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.8)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{seminar.school}</h3>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {seminar.grade10 && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Grade 10</span>}
                    {seminar.grade11 && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Grade 11</span>}
                  </div>

                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>{seminar.title}</p>
                  <p style={{ margin: '0.25rem 0 1rem 0', fontWeight: 600, fontSize: '0.875rem' }}>
                    {formatTime(seminar.startTime)} - {formatTime(seminar.endTime)}
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {seminar.locationLink && (
                      <a 
                        href={seminar.locationLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
                      >
                        <Map size={16} style={{ color: 'var(--primary-color)' }} />
                        View on Map
                      </a>
                    )}
                    
                    {seminar.date1 && (
                      <a 
                        href={generateGoogleCalendarLink(seminar, seminar.date1)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
                      >
                        <CalendarPlus size={16} style={{ color: '#ea4335' }} />
                        {seminar.date2 ? 'Add Day 1 to Google Calendar' : 'Add to Google Calendar'}
                      </a>
                    )}

                    {seminar.date2 && (
                      <a 
                        href={generateGoogleCalendarLink(seminar, seminar.date2)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
                      >
                        <CalendarPlus size={16} style={{ color: '#ea4335' }} />
                        Add Day 2 to Google Calendar
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted" style={{ textAlign: 'center', marginTop: '2rem' }}>No seminars scheduled for this day.</p>
          )
        ) : (
          <p className="text-muted" style={{ textAlign: 'center', marginTop: '2rem' }}>Click on any date in the calendar to view details.</p>
        )}
      </div>
    </div>
  );
}
