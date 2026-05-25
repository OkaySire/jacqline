export type DirEntryKind = "file" | "dir";

export interface DirEntry {
  readonly name: string;
  readonly kind: DirEntryKind;
  readonly size: number;
  /** Last-modified timestamp in milliseconds since the Unix epoch, or `null`. */
  readonly modified: number | null;
}
