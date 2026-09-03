import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const noticeIcon = {
  error: AlertCircle,
  info: Info,
  success: CheckCircle2,
};

function Toast({ notice, onDismiss }) {
  const Icon = noticeIcon[notice.type] || Info;

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(notice.id), notice.type === 'error' ? 7000 : 4500);
    return () => window.clearTimeout(timeout);
  }, [notice.id, notice.type, onDismiss]);

  return (
    <article className={`toast ${notice.type || 'info'}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <Icon size={19} />
      <p>{notice.message}</p>
      <button type="button" onClick={() => onDismiss(notice.id)} aria-label="Dismiss notification"><X size={17} /></button>
    </article>
  );
}

export default function ToastRegion({ notices = [], onDismiss }) {
  if (!notices.length) return null;
  return <div className="toast-region" aria-label="Notifications">{notices.map(notice => <Toast key={notice.id} notice={notice} onDismiss={onDismiss} />)}</div>;
}
