import cssText from './style.css?raw';

/** Module-level singleton — only one comparator overlay is open at a time. */
let root: ShadowRoot | null = null;

/** Query inside the shadow root */
export const $ = <T extends Element>(selector: string): T | null =>
  root?.querySelector<T>(selector) ?? null;

export function createShadowHost(): { host: HTMLDivElement; shadow: ShadowRoot } {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });

  root = shadow;

  const style = document.createElement('style');

  style.textContent = cssText;
  shadow.append(style);

  return { host, shadow };
}

export function destroyShadow(): void {
  if (root) {
    root.host.remove();
    root = null;
  }
}
