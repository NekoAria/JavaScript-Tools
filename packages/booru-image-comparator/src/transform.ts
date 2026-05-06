import type { SideType, StateManager, TransformState } from './types';

import { $ } from './shadow';

/** Apply CSS transform variables (flip, rotation) to image elements. */
export function applyTransforms(state: StateManager): void {
  const { transforms: t } = state.get();
  const map = {
    left: ['left-image', 'overlay-left-image'],
    right: ['right-image', 'overlay-image'],
  } as const;

  for (const side of ['left', 'right'] as const) {
    for (const id of map[side]) {
      const el = $<HTMLElement>(`#${id}`);

      if (el) {
        applyTransformTo(el, t[side]);
      }
    }
  }
}

function applyTransformTo(el: HTMLElement, t: TransformState): void {
  el.style.setProperty('--flip-x', t.flipH ? '-1' : '1');
  el.style.setProperty('--flip-y', t.flipV ? '-1' : '1');
  el.style.setProperty('--rotate', `${t.rotation}deg`);
}

export function resetTransforms(state: StateManager): void {
  state.update('transforms', {
    left: { flipH: false, flipV: false, rotation: 0 },
    right: { flipH: false, flipV: false, rotation: 0 },
  });
  applyTransforms(state);
}

export function rotateTransform(state: StateManager, side: SideType): void {
  const t = { ...state.get().transforms };

  t[side] = { ...t[side], rotation: ((t[side].rotation + 90) % 360) as 0 | 90 | 180 | 270 };
  state.update('transforms', t);
  applyTransforms(state);
}

export function toggleTransform(state: StateManager, side: SideType, key: 'flipH' | 'flipV'): void {
  const t = { ...state.get().transforms };

  t[side] = { ...t[side], [key]: !t[side][key] };
  state.update('transforms', t);
  applyTransforms(state);
}
