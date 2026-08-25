import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Square,
  Clock,
  Plus,
  MessageCirclePlus,
  Sparkles,
  Settings,
  Menu,
  BookOpen,
  ArrowUp,
  Trash2,
  Download,
  Share2,
  Pencil,
  Check,
  Copy,
  X,
  RefreshCw,
  Split,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface IconProps {
  className?: string;
  size?: number;
}

// oddeNova brand glyph, taken from public/favicon.svg (the flame path only,
// dropping the black background rect) so it renders in `currentColor` and
// matches the surrounding text color. No Lucide equivalent — kept handwritten.
export function LogoIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" className={className}>
      <path d="M410.893226 0h51.827019l223.37543 265.89514S573.036357 377.484883 550.110984 466.051282s29.391504 193.690011 126.285495 298.715653l-19.594336 29.391504s-129.518561-85.333333-174.879449 0 55.060084 203.487179 55.060084 203.487179l-16.165327 26.25641S317.036357 902.613088 339.667815 761.435897c0 0 32.330654-157.538462 229.841561-65.641025L359.066207 416.869499S624.56946 246.202832 410.893226 0z" />
    </svg>
  );
}

// Brand marks come from their real asset files in public/logo rather than a
// traced copy, and are painted as a `bg-current` mask — both files are solid
// black, and a mask lets them take the colour of the text they sit beside. Same
// treatment the provider logos get in ProviderTabs.
function MaskedLogo({ src, size, className }: IconProps & { src: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 bg-current ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${src})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskImage: `url(${src})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
      }}
    />
  );
}

export const XLogoIcon = ({ size = 16, className }: IconProps) => (
  <MaskedLogo src="/logo/X_logo_2023.svg" size={size} className={className} />
);
export const GitHubLogoIcon = ({ size = 16, className }: IconProps) => (
  <MaskedLogo src="/logo/GitHub_Invertocat_Black.svg" size={size} className={className} />
);

// Instagram's mark has no asset file here, and Lucide dropped its brand icons,
// so it is drawn: the camera outline, lens and flash it has always been, at the
// same 1.6 stroke the Lucide wrappers below use so it sits evenly beside them.
export const InstagramLogoIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.6" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

// The rest are thin wrappers over Lucide icons, keeping this project's original
// names, default sizes, and { size, className } prop shape so call sites stay
// unchanged. Play/Stop keep their filled look via fill="currentColor".
export const ChevronRightIcon = ({ size = 16, className }: IconProps) => <ChevronRight size={size} className={className} />;
export const ChevronDownIcon = ({ size = 16, className }: IconProps) => <ChevronDown size={size} className={className} />;
export const ChevronUpIcon = ({ size = 16, className }: IconProps) => <ChevronUp size={size} className={className} />;
export const PlayIcon = ({ size = 18, className }: IconProps) => <Play size={size} className={className} fill="currentColor" />;
export const PauseIcon = ({ size = 16, className }: IconProps) => <Pause size={size} className={className} fill="currentColor" />;
export const StopIcon = ({ size = 16, className }: IconProps) => <Square size={size} className={className} fill="currentColor" />;
export const HistoryIcon = ({ size = 16, className }: IconProps) => <Clock size={size} className={className} />;
export const PlusIcon = ({ size = 16, className }: IconProps) => <Plus size={size} className={className} />;
export const MessageCirclePlusIcon = ({ size = 16, className }: IconProps) => <MessageCirclePlus size={size} className={className} />;
export const SparkleIcon = ({ size = 16, className }: IconProps) => <Sparkles size={size} className={className} />;
export const SettingsIcon = ({ size = 16, className }: IconProps) => <Settings size={size} className={className} />;
export const MenuIcon = ({ size = 16, className }: IconProps) => <Menu size={size} className={className} />;
export const BookOpenIcon = ({ size = 16, className }: IconProps) => <BookOpen size={size} className={className} />;
export const ArrowUpIcon = ({ size = 16, className }: IconProps) => <ArrowUp size={size} className={className} />;
export const TrashIcon = ({ size = 16, className }: IconProps) => <Trash2 size={size} className={className} />;
export const DownloadIcon = ({ size = 16, className }: IconProps) => <Download size={size} className={className} />;
export const ShareIcon = ({ size = 16, className }: IconProps) => <Share2 size={size} className={className} />;
export const EditIcon = ({ size = 16, className }: IconProps) => <Pencil size={size} className={className} />;
export const CheckIcon = ({ size = 16, className }: IconProps) => <Check size={size} className={className} />;
export const CopyIcon = ({ size = 16, className }: IconProps) => <Copy size={size} className={className} />;
export const XIcon = ({ size = 16, className }: IconProps) => <X size={size} className={className} />;
export const RetryIcon = ({ size = 16, className }: IconProps) => <RefreshCw size={size} className={className} />;
export const GitBranchIcon = ({ size = 16, className }: IconProps) => <Split size={size} className={className} />;
export const VolumeIcon = ({ size = 16, className }: IconProps) => <Volume2 size={size} className={className} />;
export const MutedVolumeIcon = ({ size = 16, className }: IconProps) => <VolumeX size={size} className={className} />;
export const MaximizeIcon = ({ size = 16, className }: IconProps) => <Maximize2 size={size} className={className} />;
export const MinimizeIcon = ({ size = 16, className }: IconProps) => <Minimize2 size={size} className={className} />;
