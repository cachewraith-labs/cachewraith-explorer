import logos from 'virtual:brand-logos';
import {
  Archive,
  Bookmark,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Bug,
  Calendar,
  Camera,
  Car,
  ChartColumn,
  Cloud,
  Code,
  Coffee,
  Cpu,
  Crown,
  Database,
  Dices,
  DollarSign,
  Download,
  Dumbbell,
  FileText,
  Film,
  Flag,
  Flame,
  FlaskConical,
  Gamepad2,
  Ghost,
  Gift,
  Globe,
  GraduationCap,
  Headphones,
  Heart,
  House,
  Image,
  Joystick,
  Key,
  Laptop,
  Leaf,
  Lock,
  type LucideIcon,
  Mail,
  Map as MapPin,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  Music,
  Package,
  Palette,
  PawPrint,
  PenTool,
  Pizza,
  Plane,
  Puzzle,
  Receipt,
  Rocket,
  Server,
  Shield,
  ShoppingCart,
  Skull,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Swords,
  Terminal,
  Trophy,
  Tv,
  Upload,
  User,
  Users,
  Video,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';

import { FOLDER_ICONS, folderIconLabel, isFolderIcon } from './material';

/**
 * Every icon a folder can be given, stored as one string:
 * - `folder-…`: a Material Icon Theme folder (`folder-src`);
 * - `logo-<slug>`: a folder badged with a framework or app logo (`logo-fastapi`);
 * - `symbol-<id>`: a folder with a generic symbol inside (`symbol-game`).
 *
 * Parsed into a discriminated union and rendered with a `switch`; three fixed variants do
 * not need a class per kind.
 */
export type FolderIcon =
  | { kind: 'theme'; id: string; label: string; name: string }
  | { kind: 'logo'; id: string; label: string; url: string }
  | { kind: 'symbol'; id: string; label: string; Glyph: LucideIcon };

export type FolderIconGroup = 'theme' | 'logo' | 'symbol';

const LOGO_PREFIX = 'logo-';
const SYMBOL_PREFIX = 'symbol-';

/** Symbol id → glyph. The id is also the search term, so name them the way people ask. */
const SYMBOLS: Record<string, LucideIcon> = {
  game: Gamepad2,
  arcade: Joystick,
  rpg: Swords,
  trophy: Trophy,
  dice: Dices,
  puzzle: Puzzle,
  document: FileText,
  book: BookOpen,
  school: GraduationCap,
  work: Briefcase,
  invoice: Receipt,
  money: DollarSign,
  wallet: Wallet,
  shopping: ShoppingCart,
  chart: ChartColumn,
  calendar: Calendar,
  mail: Mail,
  chat: MessageCircle,
  music: Music,
  headphones: Headphones,
  podcast: Mic,
  movie: Film,
  video: Video,
  tv: Tv,
  photo: Camera,
  image: Image,
  art: Palette,
  design: PenTool,
  code: Code,
  terminal: Terminal,
  database: Database,
  server: Server,
  hardware: Cpu,
  bug: Bug,
  lab: FlaskConical,
  ai: Brain,
  bot: Bot,
  rocket: Rocket,
  tools: Wrench,
  package: Package,
  archive: Archive,
  download: Download,
  upload: Upload,
  cloud: Cloud,
  web: Globe,
  key: Key,
  private: Lock,
  security: Shield,
  phone: Smartphone,
  desktop: Monitor,
  laptop: Laptop,
  home: House,
  person: User,
  family: Users,
  pets: PawPrint,
  travel: Plane,
  map: MapPin,
  car: Car,
  fitness: Dumbbell,
  food: Pizza,
  coffee: Coffee,
  nature: Leaf,
  sun: Sun,
  night: Moon,
  favorite: Heart,
  star: Star,
  bookmark: Bookmark,
  flag: Flag,
  important: Zap,
  hot: Flame,
  magic: Sparkles,
  crown: Crown,
  gift: Gift,
  ghost: Ghost,
  skull: Skull,
};

const LOGOS = new Map(logos.map((logo) => [logo.slug, logo]));

export function logoUrl(slug: string): string {
  return `/brand-logos/${slug}.svg`;
}

/** `null` for a name this build does not know (e.g. saved by a newer version). */
export function parseFolderIcon(id: string): FolderIcon | null {
  if (id.startsWith(LOGO_PREFIX)) {
    const logo = LOGOS.get(id.slice(LOGO_PREFIX.length));
    return logo ? { kind: 'logo', id, label: logo.title, url: logoUrl(logo.slug) } : null;
  }
  if (id.startsWith(SYMBOL_PREFIX)) {
    const symbol = id.slice(SYMBOL_PREFIX.length);
    const Glyph = Object.hasOwn(SYMBOLS, symbol) ? SYMBOLS[symbol] : undefined;
    return Glyph ? { kind: 'symbol', id, label: symbol, Glyph } : null;
  }
  return isFolderIcon(id) ? { kind: 'theme', id, label: folderIconLabel(id), name: id } : null;
}

/** Every choice for the picker, by tab, in display order. */
export const FOLDER_ICON_GROUPS: Record<FolderIconGroup, readonly FolderIcon[]> = {
  theme: FOLDER_ICONS.map((id) => parseFolderIcon(id)).filter((icon) => icon !== null),
  logo: logos.map((logo) => parseFolderIcon(`${LOGO_PREFIX}${logo.slug}`)).filter((icon) => icon !== null),
  symbol: Object.keys(SYMBOLS)
    .map((id) => parseFolderIcon(`${SYMBOL_PREFIX}${id}`))
    .filter((icon) => icon !== null),
};

export function folderIconGroup(id: string): FolderIconGroup {
  if (id.startsWith(LOGO_PREFIX)) return 'logo';
  if (id.startsWith(SYMBOL_PREFIX)) return 'symbol';
  return 'theme';
}

/** Search text: the label plus the id, so `fastapi`, `FastAPI` and `logo-fastapi` all match. */
export function folderIconMatches(icon: FolderIcon, terms: string[]): boolean {
  const haystack = `${icon.label} ${icon.id}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
