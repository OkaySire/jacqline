interface JacqlineMarkProps {
  readonly size?: number;
  readonly className?: string;
}

/**
 * The Jacqline brand mark — a purple rounded square with a white corner stroke
 * inside. Identical geometry to the mockup (docs/mockup.html, viewBox normalized
 * to 48x48). Scaling via `size` preserves the radius/stroke proportions.
 */
export function JacqlineMark({ size = 48, className }: JacqlineMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="12" fill="#7c3aed" />
      <path
        d="M 16 20 L 16 40 L 32 40"
        stroke="#ffffff"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
