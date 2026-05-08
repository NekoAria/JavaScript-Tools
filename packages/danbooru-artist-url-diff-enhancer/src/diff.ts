import type { DiffPair, DiffResult, NormalizedUrl } from './types';

import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from './types';

function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) {
    return 1;
  }
  if (!str1 || !str2) {
    return 0;
  }

  const diffs = lcsCharDiff(str1, str2);
  let commonLength = 0;

  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      commonLength += text.length;
    }
  }

  return commonLength / Math.max(str1.length, str2.length);
}

function cleanupMerge(diffs: DiffResult[]): DiffResult[] {
  const merged: DiffResult[] = [];

  for (const diff of diffs) {
    const last = merged.at(-1);

    if (last && last[0] === diff[0]) {
      last[1] += diff[1];
    } else if (diff[1]) {
      merged.push([diff[0], diff[1]]);
    }
  }

  return merged;
}

/**
 * Compute a character-level diff between two strings.
 *
 * Uses several fast-path checks before falling back to full LCS:
 * - Empty input on either side → trivial insert/delete.
 * - One string is a substring of the other → single edit block.
 * - Short text is a single character → full replace.
 */
function computeDiff(text1: string, text2: string): DiffResult[] {
  if (!text1) {
    return [[DIFF_INSERT, text2]];
  }
  if (!text2) {
    return [[DIFF_DELETE, text1]];
  }

  const longText = text1.length > text2.length ? text1 : text2;
  const shortText = text1.length > text2.length ? text2 : text1;
  const i = longText.indexOf(shortText);

  if (i !== -1) {
    const isDelete = text1.length > text2.length;
    const outerType = isDelete ? DIFF_DELETE : DIFF_INSERT;
    const diffs: DiffResult[] = [
      [outerType, longText.slice(0, i)],
      [DIFF_EQUAL, shortText],
      [outerType, longText.slice(i + shortText.length)],
    ];

    return diffs.filter((d) => d[1]);
  }

  if (shortText.length === 1) {
    return [
      [DIFF_DELETE, text1],
      [DIFF_INSERT, text2],
    ];
  }

  return lcsBasedDiff(text1, text2);
}

function decodeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

// Extract significant numeric IDs from the raw URL (query string included).
// 6+ digits filters out things like version numbers and page indices while
// still catching most user/artist IDs across booru-style sites.
function extractSignificantIds(url: string): string[] {
  return url.match(/\d{6,}/g) ?? [];
}

/**
 * Classic LCS (Longest Common Subsequence) diff via dynamic programming.
 *
 * Builds a DP table over two strings (O(m·n) time, O(n) row memory)
 * and records backtracking directions in a `paths` matrix so the
 * full edit script can be reconstructed in a single reverse pass.
 *
 * The row-swap optimization (`prev` / `curr`) keeps the working set
 * small; the `paths` matrix is still O(m·n) but acceptable for
 * typical URL-length strings.
 */
function lcsBasedDiff(text1: string, text2: string): DiffResult[] {
  const m = text1.length;
  const n = text2.length;

  const DIAGONAL = 0;
  const UP = 1;
  const LEFT = 2;

  let prev = Array.from({ length: n + 1 }, () => 0);
  let curr = Array.from({ length: n + 1 }, () => 0);

  const paths = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));

  // Forward pass: fill LCS lengths and backtrack directions
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        paths[i][j] = DIAGONAL;
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        paths[i][j] = UP;
      } else {
        curr[j] = curr[j - 1];
        paths[i][j] = LEFT;
      }
    }
    [prev, curr] = [curr, prev];
  }

  // Backtrack through the DP table to reconstruct the diff
  const diffs: DiffResult[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && text1[i - 1] === text2[j - 1]) {
      diffs.push([DIFF_EQUAL, text1[i - 1]]);
      i--;
      j--;
    } else if (i > 0 && (j === 0 || paths[i][j] === UP)) {
      diffs.push([DIFF_DELETE, text1[i - 1]]);
      i--;
    } else {
      diffs.push([DIFF_INSERT, text2[j - 1]]);
      j--;
    }
  }

  return diffs.toReversed();
}

/**
 * Public character-level diff entry point.
 *
 * Strips common prefix / suffix before delegating to the LCS core
 * to keep the DP table as small as possible.  Adjacent same-type ops
 * are merged before returning.
 */
export function lcsCharDiff(text1: string, text2: string): DiffResult[] {
  if (text1 === text2) {
    return text1 ? [[DIFF_EQUAL, text1]] : [];
  }
  if (!text1) {
    return [[DIFF_INSERT, text2]];
  }
  if (!text2) {
    return [[DIFF_DELETE, text1]];
  }

  let commonPrefix = 0;
  const minLen = Math.min(text1.length, text2.length);

  while (commonPrefix < minLen && text1[commonPrefix] === text2[commonPrefix]) {
    commonPrefix++;
  }

  let commonSuffix = 0;

  while (
    commonSuffix < minLen - commonPrefix &&
    text1[text1.length - 1 - commonSuffix] === text2[text2.length - 1 - commonSuffix]
  ) {
    commonSuffix++;
  }

  const prefix = text1.slice(0, commonPrefix);
  const suffix = text1.slice(text1.length - commonSuffix);

  const mid1 = text1.slice(commonPrefix, text1.length - commonSuffix);
  const mid2 = text2.slice(commonPrefix, text2.length - commonSuffix);

  const diffs = computeDiff(mid1, mid2);

  if (prefix) {
    diffs.unshift([DIFF_EQUAL, prefix]);
  }
  if (suffix) {
    diffs.push([DIFF_EQUAL, suffix]);
  }

  return cleanupMerge(diffs);
}

function longestCommonPrefix(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;

  while (i < len && a[i] === b[i]) {
    i++;
  }

  return i;
}

function normalizeUrlForComparison(url: string): NormalizedUrl {
  const parsed = tryParseUrl(url);

  if (!parsed) {
    return {
      host: '',
      path: '',
      normalized: url.toLowerCase(),
      original: url,
    };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const path = parsed.pathname.split('/').filter(Boolean).join('/').toLowerCase();

  // NOTE: query string (search) and hash are intentionally ignored.
  // For Danbooru artist URLs this is correct, but if reused in broader
  // contexts, URLs with different query params may be incorrectly paired.

  return {
    host,
    path,
    normalized: path ? `${host}/${path}` : host,
    original: url,
  };
}

/**
 * Pair removed URLs with added URLs using a cascading six-phase matcher.
 *
 * Each phase handles a different relationship between URLs so that the
 * most confident matches are made first, preventing weaker heuristics
 * from "stealing" obvious pairs.
 *
 * 1. Negation  — "-foo" ↔ "foo"
 * 2. Normalized — identical after case-folding / host-normalization
 * 3. Same path — domain migration (e.g. twitter.com → x.com)
 * 4. Shared IDs — 6+ digit numeric IDs appear in both URLs
 * 5. Similarity — LCS-based character similarity (greedy, global max)
 * 6. Unmatched  — remaining items as pure insertions / deletions
 */
export function optimizedDiff(removedUrls: string[], addedUrls: string[]): DiffPair[] {
  const pairs: DiffPair[] = [];
  const usedAdded = new Set<number>();
  const usedRemoved = new Set<number>();

  const normalizedRemoved = removedUrls.map((url) => normalizeUrlForComparison(url));
  const normalizedAdded = addedUrls.map((url) => normalizeUrlForComparison(url));

  // Phase 1: Exact negation matching (URL ↔ -URL)
  for (const [i, removedUrl] of removedUrls.entries()) {
    if (usedRemoved.has(i)) {
      continue;
    }

    for (const [j, addedUrl] of addedUrls.entries()) {
      if (usedAdded.has(j)) {
        continue;
      }

      if (addedUrl === `-${removedUrl}` || removedUrl === `-${addedUrl}`) {
        pairs.push({
          removed: removedUrl,
          added: addedUrl,
          type: 'changed',
        });
        usedRemoved.add(i);
        usedAdded.add(j);
        break;
      }
    }
  }

  // Phase 2: Identical after normalization
  for (const [i, removedUrl] of removedUrls.entries()) {
    if (usedRemoved.has(i)) {
      continue;
    }

    for (const [j, addedUrl] of addedUrls.entries()) {
      if (usedAdded.has(j)) {
        continue;
      }

      if (normalizedRemoved[i].normalized === normalizedAdded[j].normalized) {
        pairs.push({
          removed: removedUrl,
          added: addedUrl,
          type: 'changed',
        });
        usedRemoved.add(i);
        usedAdded.add(j);
        break;
      }
    }
  }

  // Phase 3: Identical path (domain migration)
  for (const [i, removedUrl] of removedUrls.entries()) {
    if (usedRemoved.has(i)) {
      continue;
    }

    const removedPath = normalizedRemoved[i].path;

    if (!removedPath) {
      continue;
    }

    for (const [j, addedUrl] of addedUrls.entries()) {
      if (usedAdded.has(j)) {
        continue;
      }

      const addedPath = normalizedAdded[j].path;

      if (removedPath === addedPath) {
        pairs.push({
          removed: removedUrl,
          added: addedUrl,
          type: 'changed',
        });
        usedRemoved.add(i);
        usedAdded.add(j);
        break;
      }
    }
  }

  // Phase 4: Significant ID matching.
  // Catches cases where the same ID is relocated across URL structures:
  //   - query string → path:   pixiv.net/member.php?id=X     → pixiv.net/users/X
  //   - domain migration + path move:
  //                            twitter.com/intent/user?user_id=X → x.com/i/user/X
  // This must run before Phase 5 so that exact-ID hits are not stolen
  // by lower-confidence character-similarity matches.
  const removedIds = removedUrls.map((url) => extractSignificantIds(url));
  const addedIds = addedUrls.map((url) => extractSignificantIds(url));

  for (const [i, removedUrl] of removedUrls.entries()) {
    if (usedRemoved.has(i) || removedIds[i].length === 0) {
      continue;
    }

    for (const [j, addedUrl] of addedUrls.entries()) {
      if (usedAdded.has(j) || addedIds[j].length === 0) {
        continue;
      }

      const hasSharedId = removedIds[i].some((id) => addedIds[j].includes(id));

      if (hasSharedId) {
        pairs.push({
          removed: removedUrl,
          added: addedUrl,
          type: 'changed',
        });
        usedRemoved.add(i);
        usedAdded.add(j);
        break;
      }
    }
  }

  // Phase 5: Similarity matching (global sort-then-greedy)
  const candidates: { i: number; j: number; similarity: number }[] = [];

  for (let i = 0; i < removedUrls.length; i++) {
    if (usedRemoved.has(i)) {
      continue;
    }

    for (let j = 0; j < addedUrls.length; j++) {
      if (usedAdded.has(j)) {
        continue;
      }

      // Quick pre-screen: skip clearly unrelated pairs before running expensive LCS.
      // This is a performance/recall trade-off: pairs with different domains and
      // very short path prefix overlap are unlikely to match, but may occasionally
      // skip valid matches (e.g. domain migration with completely different paths).
      const sameDomain = normalizedRemoved[i].host === normalizedAdded[j].host;
      const pathPrefixLen = longestCommonPrefix(normalizedRemoved[i].path, normalizedAdded[j].path);

      if (!sameDomain && pathPrefixLen < 3) {
        continue;
      }

      const similarity = calculateSimilarity(
        normalizedRemoved[i].normalized,
        normalizedAdded[j].normalized,
      );

      const threshold = sameDomain ? 0.5 : 0.6;

      if (similarity > threshold) {
        candidates.push({ i, j, similarity });
      }
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);

  for (const { i, j } of candidates) {
    if (!usedRemoved.has(i) && !usedAdded.has(j)) {
      pairs.push({
        removed: removedUrls[i],
        added: addedUrls[j],
        type: 'changed',
      });
      usedRemoved.add(i);
      usedAdded.add(j);
    }
  }

  // Phase 6: Unmatched items
  for (const [i, removedUrl] of removedUrls.entries()) {
    if (!usedRemoved.has(i)) {
      pairs.push({ removed: removedUrl, added: null, type: 'removed' });
    }
  }

  for (const [j, addedUrl] of addedUrls.entries()) {
    if (!usedAdded.has(j)) {
      pairs.push({ removed: null, added: addedUrl, type: 'added' });
    }
  }

  return pairs;
}

function tryParseUrl(url: string): URL | null {
  try {
    const decoded = decodeUrl(url);
    const clean = decoded.startsWith('-') ? decoded.slice(1) : decoded;

    return new URL(clean);
  } catch {
    // Silently ignore malformed URLs; they'll fall back to raw lowercase comparison.
    return null;
  }
}
