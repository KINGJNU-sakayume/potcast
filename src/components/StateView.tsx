import type { ReactNode } from 'react';

/**
 * The v7 full-page state (connect, loading, empty, error): small label, large
 * title, one paragraph, plain actions. Never a modal and never an alert().
 */
export function StateView({
  label,
  title,
  children,
  actions,
  tone = 'neutral',
}: {
  label: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'neutral' | 'alert';
}) {
  return (
    <div className="view active">
      <div className="state-page" data-tone={tone}>
        <div className="label">{label}</div>
        <h1>{title}</h1>
        {children}
        {actions && <div className="state-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** A quiet one-line loading or empty row inside a section. */
export function QuietRow({ children, role }: { children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className="empty-row" role={role}>
      {children}
    </div>
  );
}
