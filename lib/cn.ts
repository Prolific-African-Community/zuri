/** Minimal class-name joiner. Keeps component APIs tidy without a dependency. */
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
