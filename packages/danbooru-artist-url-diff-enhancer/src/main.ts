import { optimizedDiff } from './diff';
import { generateDiffHTML } from './renderer';
import cssText from './style.css?raw';

function addCustomStyles(): void {
  const style = document.createElement('style');

  style.textContent = cssText;
  document.head.append(style);
}

function init(): void {
  addCustomStyles();
  processDiffLists();

  // Debounce re-processing: Danbooru may insert several diff-list DOM
  // fragments in rapid succession (e.g. when expanding multiple artist
  // sections).  A 100 ms window coalesces those into one pass.
  let debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }

        const el = node as Element;
        // Only act when the new subtree contains un-enhanced diff lists.
        const diffLists = el.querySelectorAll('td.urls-column ul.diff-list:not([data-enhanced])');

        if (diffLists.length > 0) {
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = globalThis.setTimeout(() => {
            debounceTimer = null;
            processDiffLists();
          }, 100);
        }
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
  const diffLists = document.querySelectorAll('td.urls-column ul.diff-list:not([data-enhanced])');

  for (const diffList of diffLists) {
    const allItems = diffList.querySelectorAll('li');

    if (allItems.length === 0) {
      continue;
    }

    const removedUrls: string[] = [];
    const addedUrls: string[] = [];

    for (const li of allItems) {
      if (li.classList.contains('changed')) {
        const removedSpan = li.querySelector('.removed');
        const addedSpan = li.querySelector('.added');
        const removedUrl = removedSpan?.textContent?.trim();
        const addedUrl = addedSpan?.textContent?.trim();

        if (removedUrl) {
          removedUrls.push(removedUrl);
        }
        if (addedUrl) {
          addedUrls.push(addedUrl);
        }
      } else if (li.classList.contains('removed')) {
        const url = li.textContent?.trim();

        if (url) {
          removedUrls.push(url);
        }
      } else if (li.classList.contains('added')) {
        const url = li.textContent?.trim();

        if (url) {
          addedUrls.push(url);
        }
      }
    }

    if (removedUrls.length === 0 && addedUrls.length === 0) {
      continue;
    }

    const listEl = diffList as HTMLElement;
    const optimizedPairs = optimizedDiff(removedUrls, addedUrls);

    listEl.dataset.enhanced = 'true';
    listEl.innerHTML = generateDiffHTML(optimizedPairs);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
