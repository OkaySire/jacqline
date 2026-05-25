import { cn } from "@/lib/utils";

interface JacqlineMarkProps {
  /** Pixel size of the square. Calibrated for 18–22px (titlebar). */
  readonly size?: number;
  readonly className?: string;
}

/**
 * Brand mark — purely CSS, no SVG. Three layers stacked via the element's
 * background + `::after` (dark center) + `::before` (white corner stroke).
 *
 * Geometry tuned for `size=18` (the titlebar size). Resizing within 14–22px
 * stays crisp; larger usage (about screen, splash) should add a dedicated
 * `--large` modifier with bigger insets and stroke widths.
 */
export function JacqlineMark({ size = 18, className }: JacqlineMarkProps) {
  return (
    <span
      className={cn("jacqline-mark", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
