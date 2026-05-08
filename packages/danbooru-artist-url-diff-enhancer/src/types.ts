// Operation codes for Myers / LCS diff results.
// -1: deletion (content only in old text)
//  1: insertion (content only in new text)
//  0: equality   (content common to both)
export const DIFF_DELETE = -1;

export const DIFF_INSERT = 1;

export const DIFF_EQUAL = 0;

/** One row in the final, human-friendly diff table. */
export type DiffPair =
  | { removed: string; added: string; type: 'changed' }
  | { removed: string; added: null; type: 'removed' }
  | { removed: null; added: string; type: 'added' };

/** A single diff chunk: [operation, text]. */
export type DiffResult = [op: DiffOp, text: string];

/** Parsed URL ready for comparison (host + path, case-folded). */
export interface NormalizedUrl {
  host: string;
  path: string;
  normalized: string;
  original: string;
}

/** Union of the three diff-operation constants. */
type DiffOp = typeof DIFF_DELETE | typeof DIFF_INSERT | typeof DIFF_EQUAL;
