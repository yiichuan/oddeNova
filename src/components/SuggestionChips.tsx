interface SuggestionChipsProps {
  suggestions: string[];
  disabled?: boolean;
  onPick: (text: string) => void;
}

export default function SuggestionChips({
  suggestions,
  disabled,
  onPick,
}: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          disabled={disabled}
          className="text-xs px-2.5 py-1 rounded-md border border-border bg-bg-secondary/60 text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
