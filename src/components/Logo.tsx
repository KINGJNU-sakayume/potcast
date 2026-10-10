interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * ARC mark, shared with player1: a record with two arcs of groove sheen.
 * Drawn in the ink and background tokens, so on the desktop it takes each
 * page's colour (light on a dark album stage).
 */
export function Logo({ size = 40, className }: LogoProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="var(--ink)" />
      <path d="M10.2 17.5A15 15 0 0 1 30.5 10.5" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M37.8 30.5A15 15 0 0 1 17.5 37.5"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="24" cy="24" r="6" fill="var(--bg)" />
      <circle cx="24" cy="24" r="1.8" fill="var(--ink)" />
    </svg>
  );
}
