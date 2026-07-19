import type { StateManager } from './types';

import { $ } from './shadow';

type Attrs = Partial<{
  id: string;
  class: string;
  type: string;
  placeholder: string;
  value: string;
  min: string;
  max: string;
  title: string;
  tabindex: string;
  alt: string;
}>;

function btn(id: string, label: string, title?: string): HTMLButtonElement {
  return createEl('button', { id, class: 'btn', ...(title && { title }) }, label);
}

function buildBackgroundControls(): HTMLElement {
  const bgSelect = createEl(
    'select',
    { id: 'comparison-background', class: 'form-control' },
    new Option('Black', 'black'),
    new Option('Grey', 'grey'),
    new Option('White', 'white'),
  );

  return createEl(
    'div',
    { id: 'background-controls', class: 'control-group' },
    createEl('label', {}, 'Background:', wrapSelect(bgSelect)),
  );
}

function buildContent(): HTMLElement {
  const leftPan = createEl('div', { class: 'sync-pan', id: 'left-pan' });
  const rightPan = createEl('div', { class: 'sync-pan', id: 'right-pan' });

  leftPan.append(createEl('img', { id: 'left-image', class: 'compared-img', alt: 'Left Image' }));
  rightPan.append(
    createEl('img', { id: 'right-image', class: 'compared-img', alt: 'Right Image' }),
  );

  return createEl(
    'div',
    { id: 'comparison-content', class: 'content' },
    createEl('div', { class: 'comparison-side', id: 'left-side' }, leftPan),
    createEl('div', { id: 'comparison-divider', class: 'divider' }),
    createEl('div', { class: 'comparison-side', id: 'right-side' }, rightPan),
    createEl(
      'div',
      { id: 'comparison-overlay-container', class: 'overlay-container is-hidden' },
      createEl('div', { class: 'sync-pan', id: 'overlay-pan' }),
    ),
  );
}

function buildControlsRow(): HTMLElement {
  return createEl(
    'div',
    { id: 'all-controls-row', class: 'controls-row' },
    buildFilterControls(),
    buildBackgroundControls(),
    buildFadeControls(),
    buildDifferenceControls(),
    buildTransformControls(),
  );
}

function buildDifferenceControls(): HTMLElement {
  return createEl(
    'div',
    { id: 'difference-controls', class: 'control-group is-hidden' },
    createEl('label', {}, 'Difference Invert:', btn('invert-difference', 'Invert')),
  );
}

function buildFadeControls(): HTMLElement {
  return createEl(
    'div',
    { id: 'fade-controls', class: 'control-group is-hidden' },
    createEl(
      'label',
      {},
      'Opacity:',
      createEl('input', {
        id: 'opacity-slider',
        class: 'range-control',
        type: 'range',
        min: '0',
        max: '100',
        value: '50',
      }),
    ),
    createEl('span', { id: 'opacity-value', class: 'range-value' }, '50%'),
  );
}

function buildFilterControls(): HTMLElement {
  return createEl(
    'div',
    { id: 'filter-controls', class: 'control-group' },
    createEl(
      'label',
      {},
      'Brightness:',
      createEl('input', {
        id: 'brightness-slider',
        class: 'range-control',
        type: 'range',
        min: '0',
        max: '500',
        value: '100',
      }),
    ),
    createEl('span', { id: 'brightness-value', class: 'range-value' }, '100'),
    createEl(
      'label',
      {},
      'Saturate:',
      createEl('input', {
        id: 'saturate-slider',
        class: 'range-control',
        type: 'range',
        min: '0',
        max: '500',
        value: '100',
      }),
    ),
    createEl('span', { id: 'saturate-value', class: 'range-value' }, '100'),
    btn('reset-filters', 'Reset Filters'),
  );
}

function buildHeader(state: StateManager): HTMLElement {
  return createEl(
    'div',
    { id: 'comparison-header', class: 'header' },
    buildPrimaryControls(state),
    buildControlsRow(),
  );
}

export function buildInterface(state: StateManager): HTMLElement {
  const container = createEl('div', {
    id: 'image-comparison-container',
    class: 'comparator',
    tabindex: '0',
  });

  container.append(buildHeader(state), buildContent());

  return container;
}

function buildPrimaryControls(state: StateManager): HTMLElement {
  const currentLabel = getCurrentLabel(state);
  const modeSelect = createEl(
    'select',
    { id: 'comparison-mode', class: 'form-control' },
    new Option('Side by Side', 'side-by-side'),
    new Option('Slider', 'slider'),
    new Option('Fade', 'fade'),
    new Option('Difference', 'difference'),
  );

  return createEl(
    'div',
    { class: 'primary-controls' },
    createEl('span', {}, `Current: ${currentLabel}`),
    createEl('input', {
      id: 'second-image-input',
      class: 'form-control id-input',
      type: 'text',
      placeholder: 'Enter ID or URL',
    }),
    btn('load-comparison', 'Load'),
    createEl('span', { class: 'mode-label' }, 'Mode:'),
    wrapSelect(modeSelect),
    createEl('div', { id: 'post-info-display', class: 'post-info' }),
    createEl(
      'div',
      { class: 'right-controls' },
      btn('swap-images', 'Swap'),
      btn('reset-zoom', 'Reset Zoom'),
      createEl('button', { id: 'close-comparison', class: 'btn btn-close' }, '✕'),
    ),
  );
}

function buildTransformControls(): HTMLElement {
  return createEl(
    'div',
    { id: 'transform-controls', class: 'transform-group' },
    btn('flip-h-left', '↔️ L', 'Flip Left Horizontally'),
    btn('flip-v-left', '↕️ L', 'Flip Left Vertically'),
    btn('rotate-left', '🔄 L', 'Rotate Left'),
    btn('flip-h-right', '↔️ R', 'Flip Right Horizontally'),
    btn('flip-v-right', '↕️ R', 'Flip Right Vertically'),
    btn('rotate-right', '🔄 R', 'Rotate Right'),
    btn('reset-transform', 'Reset', 'Reset Transforms'),
  );
}

/** Create a DOM element with attributes and children. */
function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'id') {
      el.id = v;
    } else if (k === 'class') {
      el.className = v;
    } else {
      el.setAttribute(k, v);
    }
  }
  el.append(...children);

  return el;
}

/** Determine a display ID for the left (current) image based on page context. */
export function getCurrentImageId(state: StateManager): string {
  const { kind, postId } = resolvePageContext(state);

  switch (kind) {
    case 'iqdb': {
      return postId || 'iqdb';
    }
    case 'upload': {
      return 'upload';
    }
    case 'similar': {
      return 'similar';
    }
    default: {
      return postId || 'unknown';
    }
  }
}

function getCurrentLabel(state: StateManager): string {
  const { kind, postId } = resolvePageContext(state);

  switch (kind) {
    case 'iqdb': {
      return postId ? `Post #${postId}` : 'IQDB';
    }
    case 'upload': {
      return 'Upload';
    }
    case 'similar': {
      return postId ? `Post #${postId}` : 'Similar';
    }
    default: {
      return postId ? `Post #${postId}` : 'Custom';
    }
  }
}

/** Resolve the page-context kind for the current (left) image. Shared by getCurrentImageId / getCurrentLabel. */
function resolvePageContext(state: StateManager): {
  kind: 'iqdb' | 'upload' | 'similar' | 'post';
  postId: string | null;
} {
  const { site, isIqdb, isUpload, isSimilar, postId } = state.get();

  if (site === 'danbooru') {
    if (isIqdb) {
      return { kind: 'iqdb', postId };
    }
    if (isUpload) {
      return { kind: 'upload', postId: null };
    }
  } else if (isSimilar) {
    return { kind: 'similar', postId: null };
  }

  return { kind: 'post', postId };
}

/** Wrap an element in a styled select-wrapper div for the custom dropdown arrow. */
function wrapSelect(content: HTMLElement): HTMLElement {
  return createEl('div', { class: 'select-wrapper' }, content);
}

/** Maps special context-based image IDs (iqdb, upload, similar) to human-readable labels used in the comparator header. */
const ID_LABELS: Record<string, string> = {
  iqdb: 'IQDB',
  upload: 'Upload',
  similar: 'Similar',
};

/** Update the input field and post selector to reflect the newly loaded comparison post ID. */
export function updateInfoUI(postId: string): void {
  updatePostInfo();
  const input = $<HTMLInputElement>('#second-image-input');

  if (input && postId !== 'custom') {
    input.value = postId;
  }
  const selector = $<HTMLSelectElement>('.post-selector select');

  if (selector) {
    if (postId === 'custom') {
      selector.value = '';
    } else {
      selector.value = [...selector.options].some((opt) => opt.value === postId) ? postId : '';
    }
  }
}

/** Update the comparison header text showing both image IDs (e.g. "Compare: #123 vs #456"). */
export function updatePostInfo(): void {
  const leftImg = $<HTMLImageElement>('#left-image');
  const rightImg = $<HTMLImageElement>('#right-image');
  const infoEl = $<HTMLDivElement>('#post-info-display');

  if (!leftImg || !rightImg || !infoEl) {
    return;
  }

  const leftId = leftImg.dataset.id;
  const rightId = rightImg.dataset.id;

  infoEl.textContent =
    leftId && rightId
      ? `Compare: ${ID_LABELS[leftId] ?? `#${leftId}`} vs ${rightId === 'custom' ? 'Custom' : `#${rightId}`}`
      : '';
}
