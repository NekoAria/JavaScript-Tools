import { optimizedDiff } from './diff';
import { generateDiffHTML } from './renderer';
import cssText from './style.css?raw';

function addCustomStyles(): void {
  const style = document.createElement('style');

  style.textContent = cssText;
  document.head.append(style);
}

const DIFF_LIST_SELECTOR = 'ul.diff-list:not([data-enhanced])';
const URLS_COLUMN_SELECTOR = 'td.urls-column';

function appendTrimmedText(target: string[], element: Element | null): void {
  const text = element?.textContent?.trim();

  if (text) {
    target.push(text);
  }
}

function hasUnenhancedDiffList(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const el = node as Element;

  return (
    (el.matches(DIFF_LIST_SELECTOR) && el.closest(URLS_COLUMN_SELECTOR) !== null) ||
    (el.matches(URLS_COLUMN_SELECTOR) &&
      el.querySelector(`:scope ${DIFF_LIST_SELECTOR}`) !== null) ||
    el.querySelector(`:scope ${URLS_COLUMN_SELECTOR} ${DIFF_LIST_SELECTOR}`) !== null
  );
}

function init(): void {
  addCustomStyles();
  processDiffLists();

  // Debounce re-processing: Danbooru may insert several diff-list DOM
  // fragments in rapid succession (e.g. when expanding multiple artist
  // sections).  A 100 ms window coalesces those into one pass.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleProcessDiffLists = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      processDiffLists();
    }, 100);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if ([...mutation.addedNodes].some((node) => hasUnenhancedDiffList(node))) {
        scheduleProcessDiffLists();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Find every un-enhanced diff list in the DOM, extract URLs from
 * Danbooru's standard markup, run the optimized matcher, and replace
 * the list content with character-level diff HTML.
 *
 * Each processed list is tagged with `data-enhanced="true"` so the
 * MutationObserver (and this function) skip it on subsequent passes.
 */
function processDiffLists(): void {
  const diffLists = document.querySelectorAll<HTMLUListElement>(
    'td.urls-column ul.diff-list:not([data-enhanced])',
  );

  for (const diffList of diffLists) {
    const allItems = diffList.querySelectorAll('li');

    if (allItems.length === 0) {
      continue;
    }

    const removedUrls: string[] = [];
    const addedUrls: string[] = [];

    for (const li of allItems) {
      if (li.classList.contains('changed')) {
        appendTrimmedText(removedUrls, li.querySelector('.removed'));
        appendTrimmedText(addedUrls, li.querySelector('.added'));
      } else if (li.classList.contains('removed')) {
        appendTrimmedText(removedUrls, li);
      } else if (li.classList.contains('added')) {
        appendTrimmedText(addedUrls, li);
      }
    }

    if (removedUrls.length === 0 && addedUrls.length === 0) {
      continue;
    }

    const optimizedPairs = optimizedDiff(removedUrls, addedUrls);

    diffList.dataset.enhanced = 'true';
    diffList.innerHTML = generateDiffHTML(optimizedPairs);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
