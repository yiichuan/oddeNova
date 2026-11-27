import { completedDraftPrefix } from './parser';

// setCode accepts string fields. Read only the top-level code value and stop
// before an unfinished JSON escape, which can be split across stream chunks.
const codeArgument = /^\s*\{\s*(?:"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*)*"code"\s*:\s*"((?:[^"\\]|\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt]))*)/;

export function streamedCodePreview(args: string): string {
  const match = codeArgument.exec(args);
  if (!match) return '';
  try {
    const code: string = JSON.parse(`"${match[1]}"`);
    return completedDraftPrefix(code);
  } catch {
    return '';
  }
}
