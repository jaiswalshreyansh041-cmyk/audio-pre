/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared prompt construction and JSON parsing for all three models.
 */

import { AnnotationRow, FeatureToggles } from '../types';

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
  const prevContext = prevTurn
    ? `Previous turn — Emotion: ${prevTurn.emotion}, Intent: ${prevTurn.intent}, End time: ${prevTurn.endTime.toFixed(3)}s`
    : 'This is the first turn.';

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

  const user =
    `Audio segment: Turn ${turn.turnNo}, Speaker: ${turn.speaker}\n` +
    `Time: ${turn.startTime.toFixed(3)}s → ${turn.endTime.toFixed(3)}s\n` +
    `Utterance text (for reference): ${transcript || turn.originalUtterance}\n` +
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
      ? `  "speaking_rate": "<one of: Slow | Normal | Fast>",\n`
      : '') +
    (features.disfluency
      ? `  "disfluency": { "filler": bool, "false_start": bool, "self_repair": bool, "repetition": bool, "long_pause": bool, "none": bool },\n`
      : '') +
    (features.turnTaking
      ? `  "turn_taking_event": "<one of: Normal transition | Latch | Overlap | Interruption | Long gap>",\n`
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
