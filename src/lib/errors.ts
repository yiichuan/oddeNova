/** 从未知错误值中提取可读的错误信息：Error 取 message，否则 String() 兜底。 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
