import { getCommunityInviteText } from './apiKeyModalUtils';
import qrCode from '../../assets/oddeNova音乐制作社区二维码.png';

/**
 * A window of its own rather than a strip inside the one above: the invitation
 * is not part of signing in, and standing it apart is what says so. Sits as the
 * second child of a `flex-col gap-3` stack alongside the window it follows.
 */
export default function CommunityInviteCard() {
  const communityInvite = getCommunityInviteText();

  return (
    // Centred as a pair rather than pinned left: the line is far shorter than
    // the window is wide, and left-aligning it leaves all the slack stacked up
    // on one side.
    <div className="flex items-center justify-center gap-4 rounded-2xl border border-border bg-conversation-surface px-6 py-4 shadow-dialog-overlay">
      {/* The source is black on white and the white is baked into the pixels,
          so the way to grey it is to scale the whole tile down: `brightness`
          leaves black where it is and takes white to #B8B8B8. The code keeps
          its polarity, so it still scans. */}
      <img
        src={qrCode}
        alt={communityInvite.alt}
        className="qr-plate size-16 shrink-0 rounded-lg p-1 object-contain"
      />
      {/* Centred in what the code leaves rather than pushed up against it, so
          the slack sits on both sides of the line instead of all of it on the
          right. */}
      <p className="flex-1 text-center text-sm font-medium text-text-secondary">
        {communityInvite.title}
      </p>
    </div>
  );
}
