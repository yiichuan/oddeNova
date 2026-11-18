export function resolveOfficialApiKey(): string {
  return process.env.OFFICIAL_API_KEY?.trim() || process.env.VITE_API_KEY?.trim() || '';
}
