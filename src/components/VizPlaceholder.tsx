interface VizPlaceholderProps {
  isPlaying: boolean;
}

export default function VizPlaceholder({ isPlaying: _isPlaying }: VizPlaceholderProps) {
  return (
    <div className="h-full rounded-lg overflow-hidden border border-border">
      <iframe
        src="/animation/galaxy.html"
        title="galaxy visualizer"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="autoplay"
      />
    </div>
  );
}
