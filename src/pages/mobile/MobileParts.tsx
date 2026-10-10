import type { ReactNode } from 'react';

/** A row of section chips (player2's underlined filter words, sized for a thumb); scrolls sideways when it overflows. */
export function MobileChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="m-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A quiet one-line state (loading, empty, error) inside a phone section. */
export function MobileQuiet({ children, role, retry }: { children: ReactNode; role?: 'status' | 'alert'; retry?: () => void }) {
  return (
    <div className="m-quiet" role={role}>
      {children}
      {retry && (
        <button type="button" className="note-more" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
