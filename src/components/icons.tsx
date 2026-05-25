import type { ReactElement, SVGProps } from "react";

/**
 * Custom inline SVG icon set used across the app — sourced 1:1 from the
 * mockup (`docs/mockup.html`). Style is intentionally finer than lucide
 * defaults: `viewBox="0 0 16 16"`, `strokeWidth ≈ 1.2–1.4`, round caps/joins,
 * stroke = `currentColor`. Sized at their natural pixel sizes; pass
 * `style={{ width, height }}` to override.
 */

type IconProps = SVGProps<SVGSVGElement>;

// `I` is exported as a plain object so TypeScript narrows each property to a
// concrete callable function (rather than `IconFn | undefined` you'd get from
// a `Record<string, …>` annotation, which breaks `<I.close />` JSX usage).
export const I = {
  menu: (p: IconProps): ReactElement => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  plus: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}>
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  close: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}>
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  min: (p: IconProps): ReactElement => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  max: (p: IconProps): ReactElement => (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" {...p}>
      <rect x="2.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" rx="0.5" />
    </svg>
  ),
  chev: (p: IconProps): ReactElement => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path
        d="M3.5 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  chev_down: (p: IconProps): ReactElement => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path
        d="M2 3.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  folder: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M1.5 4.5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .7.3l1 1h6.1a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  ),
  sparkle: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M8 1.5l1.4 4 4 1.4-4 1.4L8 12.3 6.6 8.3l-4-1.4 4-1.4L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  ),
  cog: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  terminal: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4.5 6l2 2-2 2M8 10h3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  doc: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M3 1.5h6.5L13 5v9.5H3v-13z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 1.5V5H13M5.5 8.5h5M5.5 11h5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  check: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5 8.5l2 2 4-4.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  globe: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M1.8 8h12.4M8 1.8c2.5 2 2.5 10.4 0 12.4M8 1.8c-2.5 2-2.5 10.4 0 12.4"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  ),
  cpu: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="5.5" width="5" height="5" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M6 1.5v2M10 1.5v2M6 12.5v2M10 12.5v2M1.5 6h2M1.5 10h2M12.5 6h2M12.5 10h2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  ),
  activity: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M1.5 8h2l1.5-5 3 11 2-7 1.5 1h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  ),
  play: (p: IconProps): ReactElement => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M4 2.5l9 5.5-9 5.5z" />
    </svg>
  ),
  stop: (p: IconProps): ReactElement => (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  ),
  plug: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M6 1.5v3M10 1.5v3M4 4.5h8v3.2a4 4 0 0 1-4 4 4 4 0 0 1-4-4V4.5zM8 11.7v2.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  refresh: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M2.5 8a5.5 5.5 0 0 1 9.5-3.8M13.5 8a5.5 5.5 0 0 1-9.5 3.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M10.5 4.2H13V1.7M5.5 11.8H3v2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  arrow_left: (p: IconProps): ReactElement => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M10 3l-5 5 5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  arrow_right: (p: IconProps): ReactElement => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  search: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.4 10.4l3.1 3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  command: (p: IconProps): ReactElement => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M5 4.5a2 2 0 1 0 0 0h6a2 2 0 1 0 0 0M5 11.5a2 2 0 1 0 0 0h6a2 2 0 1 0 0 0M5 4.5v7M11 4.5v7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  ),
  panel_right: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 3v10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  panel_left: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3v10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  branch: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="4" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5v6M5.5 6h2A2 2 0 0 1 9.5 8v3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  copy: (p: IconProps): ReactElement => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M11 5V3.5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  ),
  kebab: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <circle cx="8" cy="3" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="13" r="1.4" />
    </svg>
  ),
  external: (p: IconProps): ReactElement => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M6 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5l-6 6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  trash: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  rename: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M11.5 3l2 2-8 8H3.5V11l8-8z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  duplicate: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M11 5V3.5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  ),
  edit: (p: IconProps): ReactElement => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M11 2.5l2.5 2.5-7.5 7.5H3.5V9.5l7.5-7z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M10 4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  cloud: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M4.5 12.5h7.5a2.8 2.8 0 0 0 .4-5.55 4 4 0 0 0-7.74-.62A2.8 2.8 0 0 0 4.5 12.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  ),
  cloud_off: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M4.5 12.5h7.5a2.8 2.8 0 0 0 .4-5.55 4 4 0 0 0-7.74-.62A2.8 2.8 0 0 0 4.5 12.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  /* --- shadcn-internal helpers — used by ui/dialog, ui/select, ui/dropdown-menu
   * so we can drop lucide-react entirely. Same stroke language as the rest. */
  chev_up: (p: IconProps): ReactElement => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
      <path
        d="M2 6.5l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check_mark: (p: IconProps): ReactElement => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path
        d="M3 8.5l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  dot: (p: IconProps): ReactElement => (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" {...p}>
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
};
