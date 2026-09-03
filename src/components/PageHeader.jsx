import React from 'react';

export default function PageHeader({ eyebrow, title, description, children, className = '' }) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-heading">
        <span className="eyebrow accent">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}
