import type { DiffPair, DiffResult } from './types';

import { lcsCharDiff } from './diff';
import { DIFF_DELETE, DIFF_INSERT } from './types';

/** Escape HTML special characters to prevent XSS via URL content. */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replaceAll(/[&<>"']/g, (m) => escapeMap[m]);
}

/**
 * Generate side-by-side HTML for a changed pair, highlighting
 * individual character insertions and deletions.
 */
function generateCharDiffHTML(
  oldUrl: string,
  newUrl: string,
): { removedHTML: string; addedHTML: string } {
  const diffs: DiffResult[] = lcsCharDiff(oldUrl, newUrl);

  let removedHTML = '';
  let addedHTML = '';

  for (const [type, text] of diffs) {
    const escaped = escapeHtml(text);

    if (type === DIFF_DELETE) {
      removedHTML += `<span class="char-removed">${escaped}</span>`;
    } else if (type === DIFF_INSERT) {
      addedHTML += `<span class="char-added">${escaped}</span>`;
    } else {
      removedHTML += `<span class="char-common">${escaped}</span>`;
      addedHTML += `<span class="char-common">${escaped}</span>`;
    }
  }

  return { removedHTML, addedHTML };
}

/**
 * Convert the paired-diff result into HTML markup for the Danbooru
 * diff-list.  "changed" pairs get a side-by-side character-diff view;
 * "removed" and "added" pairs render as plain highlighted rows.
 */
export function generateDiffHTML(pairs: DiffPair[]): string {
  let html = '';

  for (const pair of pairs) {
    switch (pair.type) {
      case 'changed': {
        const charDiff = generateCharDiffHTML(pair.removed, pair.added);

        html += `
          <li class="changed">
            <div class="char-diff-container">
              <div class="char-diff-removed">${charDiff.removedHTML}</div>
              <div class="char-diff-arrow">→</div>
              <div class="char-diff-added">${charDiff.addedHTML}</div>
            </div>
          </li>`;

        break;
      }
      case 'removed': {
        html += `<li class="removed">${escapeHtml(pair.removed)}</li>`;

        break;
      }
      case 'added': {
        html += `<li class="added">${escapeHtml(pair.added)}</li>`;

        break;
      }
    }
  }

  return html;
}
