/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared prompt construction and JSON parsing for all three models.
 */

import { AnnotationRow, FeatureToggles } from '../types';
import { computeSpeakingRate } from './speakingRate';

export const SYSTEM_PROMPT =
  `You are a prosodic annotation expert for Hindi conversational speech. ` +
  `You will receive an audio segment with metadata. Analyse only the features requested. ` +
  `Return strictly valid JSON with no explanation or markdown.`;

export function buildPrompt(
  transcript: string,
  turn: AnnotationRow,
  prevTurn: AnnotationRow | null,
  features: FeatureToggles,
): { system: string; user: string } {
  const gapMs = prevTurn ? Math.round((turn.startTime - prevTurn.endTime) * 1000) : null;
  const prevContext = prevTurn
    ? `Previous turn — Speaker: ${prevTurn.speaker}, Emotion: ${prevTurn.emotion}, Intent: ${prevTurn.intent}, End time: ${prevTurn.endTime.toFixed(3)}s, Gap to this turn: ${gapMs}ms`
    : 'This is the first turn (no gap).';

  const activeFeatures = [
    features.emotion && 'emotion',
    features.intent && 'intent',
    features.speakingRate && 'speaking_rate',
    features.disfluency && 'disfluency',
    features.turnTaking && 'turn_taking_event',
    features.emphasis && 'emphasized_words',
  ]
    .filter(Boolean)
    .join(', ');

  const rateHint = features.speakingRate
    ? computeSpeakingRate(transcript || turn.originalUtterance, turn.startTime, turn.endTime)
    : null;

  const user =
    `Audio segment: Turn ${turn.turnNo}, Speaker: ${turn.speaker}\n` +
    `Time: ${turn.startTime.toFixed(3)}s → ${turn.endTime.toFixed(3)}s\n` +
    `Utterance text (for reference): ${transcript || turn.originalUtterance}\n` +
    (rateHint ? `Measured speaking rate: ${rateHint.wpm} WPM (${rateHint.wordCount} words in ${rateHint.durationSec.toFixed(1)} s) — computed label: ${rateHint.label}\n` : '') +
    `${prevContext}\n\n` +
    `Evaluate the following features: ${activeFeatures}\n\n` +
    `Return JSON with exactly these keys (omit keys for inactive features):\n` +
    `{\n` +
    (features.emotion
      ? `  "emotion": "<one of: Neutral | Confident | Frustrated | Confused | Excited | Skeptical | Surprised>",\n`
      : '') +
    (features.intent
      ? `  "intent": "<one of: Question | Request | Statement | Elaboration | Proposal | Agreement | Backchannel>",\n`
      : '') +
    (features.speakingRate
      ? `  "speaking_rate": "<one of: Slow | Normal | Fast — WPM=(word_count/duration_seconds)×60; matrix: <120=Slow, 120-170=Normal, >170=Fast; use measured WPM above as primary signal>",\n`
      : '') +
    (features.disfluency
      ? `  "disfluency": { "filler": bool, "false_start": bool, "self_repair": bool, "repetition": bool, "long_pause": bool, "none": bool },\n`
      : '') +
    (features.turnTaking
      ? `  "turn_taking_event": "<one of: Latch | Normal transition | Overlap | Interruption | Long gap — matrix: gap<0s AND prev speaker finishes=Overlap; gap<0s AND prev speaker cut off=Interruption; 0-0.25s=Latch; 0.25-1.25s=Normal transition; ≥1.25s=Long gap; first turn always=Normal transition>",\n`
      : '') +
    (features.emphasis
      ? `  "emphasized_words": [<list of prosodically stressed word strings>],\n`
      : '') +
    `  "confidence": <float 0.0–1.0>\n` +
    `}`;

  return { system: SYSTEM_PROMPT, user };
}

/** Robustly extract JSON from a model response that may contain markdown fences. */
export function parseModelJSON(raw: string): Record<string, unknown> {
  let text = raw.trim();
  // Strip markdown fences
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  // Find first { … }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
