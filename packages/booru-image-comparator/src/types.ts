import type { PanzoomObject } from '@panzoom/panzoom';

export interface AppState {
  site: SiteType | null;
  isUpload?: boolean;
  isIqdb?: boolean;
  isSimilar?: boolean;
  postId: string | null;
  searchUrl: string | null;
  mode: ModeType;
  transforms: TransformsState;
  zoomState: ZoomState;
  panzoomInstances: PanzoomInstances;
  eventCleanup: Array<() => void>;
  originalImageUrl: string | null;
}

export interface BooruPostData {
  id: number | string;
  parent_id?: number | string;
  file_url?: string;
  large_file_url?: string;
  jpeg_url?: string;
}

export type ModeType = 'side-by-side' | 'slider' | 'fade' | 'difference';

export interface PostData {
  id: string;
  relationshipType: RelationshipType;
  similarity?: number | null;
  sourceHost?: string;
}

export type RelationshipType = 'Similar' | 'Parent' | 'Sibling' | 'Child';

export type SideType = 'left' | 'right';

export type SiteType = 'danbooru' | 'yandere' | 'konachan';

export interface StateManager {
  get(): AppState;
  update<K extends keyof AppState>(key: K, value: AppState[K]): void;
  update(partial: Partial<AppState>): void;
  subscribe(listener: (next: AppState, prev: AppState) => void): () => void;
}

export interface TransformState {
  flipH: boolean;
  flipV: boolean;
  rotation: 0 | 90 | 180 | 270;
}

interface PanzoomInstances {
  left?: PanzoomObject | null;
  right?: PanzoomObject | null;
  overlay?: PanzoomObject | null;
}

interface TransformsState {
  left: TransformState;
  right: TransformState;
}

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}
