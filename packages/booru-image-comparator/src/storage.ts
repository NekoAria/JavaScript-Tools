import type { ModeType, StateManager } from './types';

import {
  MODES,
  MODES_ARRAY,
  STORAGE_KEY_BACKGROUND,
  STORAGE_KEY_MODE,
  VALID_BACKGROUNDS,
} from './constants';
import { updateBackground } from './filter';
import { $ } from './shadow';

function getSavedBackground(): string {
  let s: string | null;

  try {
    s = localStorage.getItem(STORAGE_KEY_BACKGROUND);
  } catch {
    return 'black';
  }

  return s && VALID_BACKGROUNDS.has(s) ? s : 'black';
}

function getSavedMode(): ModeType {
  let s: string | null;

  try {
    s = localStorage.getItem(STORAGE_KEY_MODE);
  } catch {
    return MODES.SIDE_BY_SIDE;
  }

  return s && MODES_ARRAY.includes(s as ModeType) ? (s as ModeType) : MODES.SIDE_BY_SIDE;
}

export function persistBackground(): void {
  try {
    const sel = $<HTMLSelectElement>('#comparison-background');

    if (sel) {
      localStorage.setItem(STORAGE_KEY_BACKGROUND, sel.value);
    }
  } catch (error) {
    console.warn('Failed to save background:', error);
  }
}

export function persistMode(): void {
  try {
    const sel = $<HTMLSelectElement>('#comparison-mode');

    if (sel) {
      localStorage.setItem(STORAGE_KEY_MODE, sel.value);
    }
  } catch (error) {
    console.warn('Failed to save mode:', error);
  }
}

export function restoreBackground(): void {
  const saved = getSavedBackground();
  const sel = $<HTMLSelectElement>('#comparison-background');

  if (sel) {
    sel.value = saved;
  }
  updateBackground();
}

export function restoreMode(state: StateManager): void {
  const saved = getSavedMode();

  state.update('mode', saved);
  const sel = $<HTMLSelectElement>('#comparison-mode');

  if (sel) {
    sel.value = saved;
  }
}
