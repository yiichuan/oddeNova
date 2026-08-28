/**
 * The two full-page blur bands used by the Favorites archive.
 *
 * Six flat spans per edge, one per `nth-child` rung of the blur ladder in
 * index.css — a span past the last rung would be an unmasked, unfiltered pane
 * over the reading. The page mounts this component outside the scrolling
 * archive so the layers stay absolute and stable while the conversation moves
 * below it.
 */
const BLUR_LAYERS = 6;

export default function ConversationBlurBands() {
  return (['top', 'bottom'] as const).map((edge) => (
    <div
      key={edge}
      aria-hidden="true"
      data-conversation-blur-fade={edge}
      className={`conversation-blur-fade conversation-blur-fade--${edge}`}
    >
      {Array.from({ length: BLUR_LAYERS }, (_, layer) => (
        <span key={layer} />
      ))}
    </div>
  ));
}
