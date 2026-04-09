/**
 * Speaking Rate Calculator for Hindi Conversational Speech
 *
 * Method: Words-Per-Minute (WPM) computed from transcript word count
 * and turn duration. For Hindi, each whitespace-delimited token is one
 * "word" (Devanagari script is naturally space-delimited).
 *
 * Classification thresholds (calibrated for Hindi conversational speech):
 *   Slow   : WPM < 90
 *   Normal : 90 ≤ WPM ≤ 160
 *   Fast   : WPM > 160
 *
 * These align with published Hindi speech rate studies (approx 3–5.5
 * syllables/sec maps to 80–160 WPM for typical Hindi word length).
 */

export interface SpeakingRateResult {
  wpm: number;               // words per minute
  wordCount: number;         // number of words in utterance
  durationSec: number;       // audio segment duration
  label: 'Slow' | 'Normal' | 'Fast';
}

const SLOW_THRESHOLD   = 90;   // WPM below this → Slow
const FAST_THRESHOLD   = 160;  // WPM above this → Fast

/**
 * Count words in a Hindi/English/mixed utterance.
 * Strips punctuation, counts whitespace-separated tokens.
 */
function countWords(text: string): number {
  return text
    .trim()
    .replace(/[।,।!"'()\-–—]/g, ' ')  // replace punctuation with space
    .split(/\s+/)
    .filter(t => t.length > 0)
    .length;
}

/**
 * Compute speaking rate from utterance text and segment duration.
 *
 * @param utterance  - transcript text of the turn
 * @param startSec   - turn start time in seconds
 * @param endSec     - turn end time in seconds
 * @returns SpeakingRateResult with wpm, label, and diagnostics
 */
export function computeSpeakingRate(
  utterance: string,
  startSec: number,
  endSec: number,
): SpeakingRateResult {
  const durationSec = Math.max(endSec - startSec, 0.1); // avoid div-by-zero
  const wordCount   = countWords(utterance || '');
  const wpm         = (wordCount / durationSec) * 60;

  const label: 'Slow' | 'Normal' | 'Fast' =
    wpm < SLOW_THRESHOLD  ? 'Slow'   :
    wpm > FAST_THRESHOLD  ? 'Fast'   : 'Normal';

  return { wpm: Math.round(wpm), wordCount, durationSec, label };
}

/**
 * Produce a human-readable summary string for UI display.
 * e.g. "Normal · 123 WPM (12 words / 5.8 s)"
 */
export function formatSpeakingRate(r: SpeakingRateResult): string {
  return `${r.label} · ${r.wpm} WPM (${r.wordCount} words / ${r.durationSec.toFixed(1)} s)`;
}
