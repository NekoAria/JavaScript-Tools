import { $ } from './shadow';

function applyFade(pct: number): void {
  const overlayImg = $<HTMLImageElement>('#overlay-image');

  if (overlayImg) {
    overlayImg.style.setProperty('--fade-opacity', String(pct / 100));
  }

  const sl = $<HTMLInputElement>('#opacity-slider');

  if (sl) {
    sl.value = String(pct);
  }

  const vl = $<HTMLSpanElement>('#opacity-value');

  if (vl) {
    vl.textContent = `${pct}%`;
  }
}

export function resetFilters(): void {
  for (const id of ['brightness-slider', 'saturate-slider'] as const) {
    const el = $<HTMLInputElement>(`#${id}`);

    if (el) {
      el.value = '100';
    }
  }
  updateFilters();
}

export function toggleDifferenceInvert(): void {
  const cont = $<HTMLElement>('#comparison-overlay-container');
  const btn = $<HTMLButtonElement>('#invert-difference');

  if (!cont || !btn) {
    return;
  }
  const on = cont.classList.toggle('is-inverted');

  btn.textContent = on ? 'Normal' : 'Invert';
}

export function updateBackground(): void {
  const sel = $<HTMLSelectElement>('#comparison-background');
  const value = sel?.value;

  if (!value) {
    return;
  }

  const cont = $<HTMLElement>('#comparison-overlay-container');

  if (cont) {
    cont.dataset.bg = value;
  }

  const content = $<HTMLElement>('#comparison-content');

  if (content) {
    content.dataset.bg = value;
  }
}

export function updateFilters(): void {
  const brightSl = $<HTMLInputElement>('#brightness-slider');
  const satSl = $<HTMLInputElement>('#saturate-slider');
  const brightVl = $<HTMLSpanElement>('#brightness-value');
  const satVl = $<HTMLSpanElement>('#saturate-value');

  if (!brightSl || !satSl || !brightVl || !satVl) {
    return;
  }

  brightVl.textContent = brightSl.value;
  satVl.textContent = satSl.value;

  const filter = `brightness(${+brightSl.value / 100}) saturate(${+satSl.value / 100})`;

  for (const id of ['overlay-pan', 'left-pan', 'right-pan'] as const) {
    const pan = $<HTMLElement>(`#${id}`);

    if (pan) {
      pan.style.filter = filter;
    }
  }
}

export function updateOpacity(): void {
  const sl = $<HTMLInputElement>('#opacity-slider');

  if (sl) {
    applyFade(+sl.value);
  }
}
