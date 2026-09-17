import { Download, Folder, House, Image, type LucideIcon, Monitor, Music, Video } from 'lucide-react';

import type { PlaceId } from '@/ipc/types';

export const PLACE_ICONS: Record<PlaceId, LucideIcon> = {
  home: House,
  desktop: Monitor,
  documents: Folder,
  downloads: Download,
  pictures: Image,
  music: Music,
  videos: Video,
};
