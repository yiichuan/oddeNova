interface VizPlaceholderProps {
  isPlaying: boolean;
}

export default function VizPlaceholder({ isPlaying }: VizPlaceholderProps) {
  return (
    <div className="h-full bg-bg-secondary/40 border border-border rounded-lg flex items-center justify-center relative overflow-hidden">
      <span
        className={`w-2 h-2 rounded-full ${
          isPlaying ? 'bg-success animate-pulse' : 'bg-success/50'
        }`}
      />
    </div>
  );
}
