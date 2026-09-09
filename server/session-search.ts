export function titleSearchPattern(value: string | undefined): string | null {
  const query = value?.trim();
  if (!query) return null;
  return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
