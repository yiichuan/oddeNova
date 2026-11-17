interface HighlightedSecondsProps {
  text: string;
  className?: string;
}

const SECONDS_PATTERN = /(\d+(?:\.\d+)?\s*(?:秒|s)(?![a-z]))/gi;
const SINGLE_SECONDS_PATTERN = /^\d+(?:\.\d+)?\s*(?:秒|s)$/i;

export function HighlightedSeconds({ text, className }: HighlightedSecondsProps) {
  const highlightBgm = text.startsWith('开始给这段视频写');
  const pattern = highlightBgm ? /(bgm|\d+(?:\.\d+)?\s*(?:秒|s)(?![a-z]))/gi : SECONDS_PATTERN;
  return (
    <span className={className}>
      {text.split(pattern).map((part, index) =>
        (SINGLE_SECONDS_PATTERN.test(part) || (highlightBgm && /^bgm$/i.test(part)))
          ? <strong key={index} className="font-bold text-accent">{part}</strong>
          : part,
      )}
    </span>
  );
}
