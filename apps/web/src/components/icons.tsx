// Icon shapes are from Lucide (https://lucide.dev), ISC licence.
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Ban,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock,
  Copy,
  Crown,
  Download,
  History,
  Info,
  Landmark,
  Languages,
  Link as LinkIcon,
  Luggage,
  Map as MapIcon,
  Mars,
  Merge,
  Pencil,
  PieChart,
  PiggyBank,
  Plus,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Share2,
  Shield,
  Star,
  Trash2,
  Trophy,
  User,
  UserCheck,
  UserPlus,
  Users,
  Venus,
  X,
} from 'lucide-react';

export type IconName =
  | 'back' | 'settings' | 'userPlus' | 'userCheck' | 'share' | 'copy' | 'download' | 'check' | 'circleCheck'
  | 'x' | 'chevronRight' | 'chevronDown' | 'chevronUp' | 'info' | 'receipt' | 'suitcase' | 'map' | 'link'
  | 'qr' | 'clock' | 'users' | 'history' | 'bank' | 'language' | 'search' | 'edit' | 'ban' | 'merge'
  | 'trash' | 'pie' | 'plus' | 'mars' | 'venus' | 'trophy' | 'rotateCcw' | 'camera' | 'shield' | 'swap' | 'piggyBank'
  | 'star' | 'crown' | 'user';

const SHAPES: Record<IconName, LucideIcon> = {
  swap: ArrowLeftRight,
  back: ArrowLeft,
  settings: Settings,
  user: User,
  userPlus: UserPlus,
  userCheck: UserCheck,
  share: Share2,
  copy: Copy,
  download: Download,
  check: Check,
  circleCheck: CircleCheck,
  x: X,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  info: Info,
  receipt: Receipt,
  suitcase: Luggage,
  map: MapIcon,
  link: LinkIcon,
  qr: QrCode,
  clock: Clock,
  users: Users,
  history: History,
  bank: Landmark,
  language: Languages,
  search: Search,
  edit: Pencil,
  ban: Ban,
  merge: Merge,
  trash: Trash2,
  pie: PieChart,
  plus: Plus,
  mars: Mars,
  venus: Venus,
  trophy: Trophy,
  rotateCcw: RotateCcw,
  camera: Camera,
  shield: Shield,
  piggyBank: PiggyBank,
  star: Star,
  crown: Crown,
};

/** Decorative icon (aria-hidden); a button that holds only an icon must carry its own aria-label and title. */
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const Component = SHAPES[name];
  return (
    <Component
      size={size}
      strokeWidth={2}
      className={className}
      aria-hidden="true"
    />
  );
}
