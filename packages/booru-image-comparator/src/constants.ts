import type { ModeType, RelationshipType } from './types';

export const STORAGE_KEY_MODE = 'universal_comparator_mode';

export const STORAGE_KEY_BACKGROUND = 'universal_comparator_background';

export const MODES = {
  SIDE_BY_SIDE: 'side-by-side',
  SLIDER: 'slider',
  FADE: 'fade',
  DIFFERENCE: 'difference',
} as const satisfies Record<string, ModeType>;

export const MODES_ARRAY = Object.freeze(Object.values(MODES)) as readonly ModeType[];

export const VALID_BACKGROUNDS: ReadonlySet<string> = new Set(['black', 'grey', 'white']);

export const RELATIONSHIP_PRIORITY: Record<RelationshipType, number> = {
  Similar: 0,
  Parent: 1,
  Sibling: 2,
  Child: 3,
};

/** Delay (ms) to allow DOM and Panzoom to initialize before loading the overlay image. */
export const OVERLAY_INIT_DELAY_MS = 100;

/** Defer execution to the next macrotask (0ms) to ensure layout is complete. */
export const LAYOUT_FLUSH_MS = 0;

/** Fallback divider width in px. Must stay in sync with CSS --sp-1. */
export const DIVIDER_WIDTH = 4;
