/** Extract a readable error message from an unknown value: uses Error.message if available, falls back to String(). */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
