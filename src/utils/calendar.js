const calendarTimestamp = (date, time) => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;

export const googleCalendarLink = (seminar, targetDate) => {
  if (!targetDate || !seminar.startTime || !seminar.endTime) return '#';
  const text = encodeURIComponent(seminar.title || 'Seminar');
  const dates = `${calendarTimestamp(targetDate, seminar.startTime)}/${calendarTimestamp(targetDate, seminar.endTime)}`;
  const location = encodeURIComponent(seminar.school || '');
  const details = encodeURIComponent('Horana Subgroup Seminar');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}&ctz=Asia%2FColombo`;
};

