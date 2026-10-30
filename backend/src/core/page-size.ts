// Clamps a requested page size to the range the API serves; anything unparsable falls back to the default.
export function pageSize(requested: string | undefined, fallback = 20, max = 100): number {
  const value = Number(requested);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}
