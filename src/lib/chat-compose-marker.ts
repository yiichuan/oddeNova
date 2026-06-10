export interface ChatComposeMarkerResult {
  displayText: string;
  composeSeed: string | null;
}

const COMPOSE_MARKER_RE = /(?:\n\s*)?\[\[(?:谱曲|compose)\s*:\s*([^\]]+?)\s*\]\]\s*$/i;

export function extractChatComposeMarker(reply: string): ChatComposeMarkerResult {
  const trimmed = reply.trim();
  const match = trimmed.match(COMPOSE_MARKER_RE);
  if (!match) {
    return { displayText: trimmed, composeSeed: null };
  }

  const composeSeed = match[1].trim();
  if (!composeSeed) {
    return { displayText: trimmed, composeSeed: null };
  }

  return {
    displayText: trimmed.slice(0, match.index).trim(),
    composeSeed,
  };
}
