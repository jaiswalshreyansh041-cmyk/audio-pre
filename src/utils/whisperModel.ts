/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Whisper-1 (transcription) + GPT-4o (label extraction) integration.
 * Audio is sliced from the full AudioBuffer, encoded to WAV, and sent
 * as multipart/form-data to the OpenAI transcriptions endpoint.
 * The resulting transcript text + utterance metadata is then fed to
 * GPT-4o chat completions to produce prosodic annotation labels.
 */

import { AnnotationRow, DisfluencyLabels, FeatureToggles, PredictionResult } from '../types';
import { audioBufferToBlob, sliceAudioBuffer } from './audioSlice';
import { buildPrompt, parseModelJSON } from './promptBuilder';

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const GPT4O_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

async function transcribeWithWhisper(
  blob: Blob,
  apiKey: string,
  language = 'hi',
): Promise<{ text: string; duration?: number }> {
  const fd = new FormData();
  fd.append('file', blob, 'segment.wav');
  fd.append('model', 'whisper-1');
  fd.append('language', language);
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'segment');

  const res = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API ${res.status}: ${err}`);
  }
  const json = await res.json();
  return { text: json.text || '', duration: json.duration };
}

async function labelWithGPT4o(
  transcript: string,
  turn: AnnotationRow,
  prevTurn: AnnotationRow | null,
  features: FeatureToggles,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const { system, user } = buildPrompt(transcript, turn, prevTurn, features);

  const res = await fetch(GPT4O_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT-4o API ${res.status}: ${err}`);
  }
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content || '{}';
  return parseModelJSON(raw);
}

export async function runWhisperOnTurn(
  buffer: AudioBuffer,
  turn: AnnotationRow,
  prevTurn: AnnotationRow | null,
  features: FeatureToggles,
  apiKey: string,
): Promise<PredictionResult> {
  const slice = sliceAudioBuffer(buffer, turn.startTime, turn.endTime);
  const blob = audioBufferToBlob(slice);

  let transcript = '';
  let whisperDuration: number | undefined;
  try {
    const r = await transcribeWithWhisper(blob, apiKey);
    transcript = r.text;
    whisperDuration = r.duration;
  } catch (e) {
    // Fall back to original utterance for label generation
    transcript = turn.originalUtterance;
  }

  const labels = await labelWithGPT4o(transcript, turn, prevTurn, features, apiKey);

  // Boundary error: compare Whisper's reported duration vs expected
  const expectedDur = turn.endTime - turn.startTime;
  const boundaryError = whisperDuration !== undefined
    ? Math.abs(whisperDuration - expectedDur) * 1000  // convert to ms
    : undefined;

  return buildPrediction(turn.turnNo, labels, boundaryError, features);
}

/** Shape the raw JSON from any model into a typed PredictionResult. */
export function buildPrediction(
  turnNo: number,
  labels: Record<string, unknown>,
  boundaryError: number | undefined,
  features: FeatureToggles,
): PredictionResult {
  const get = (key: string): string =>
    typeof labels[key] === 'string' ? (labels[key] as string).trim() : '';

  const disfluency: DisfluencyLabels = {
    filler: Boolean((labels.disfluency as any)?.filler ?? labels.filler),
    falseStart: Boolean((labels.disfluency as any)?.false_start ?? (labels.disfluency as any)?.falseStart ?? labels.false_start),
    selfRepair: Boolean((labels.disfluency as any)?.self_repair ?? (labels.disfluency as any)?.selfRepair ?? labels.self_repair),
    repetition: Boolean((labels.disfluency as any)?.repetition ?? labels.repetition),
    longPause: Boolean((labels.disfluency as any)?.long_pause ?? (labels.disfluency as any)?.longPause ?? labels.long_pause),
    none: Boolean((labels.disfluency as any)?.none ?? labels.none),
  };

  const emphasizedWords: string[] = Array.isArray(labels.emphasized_words)
    ? (labels.emphasized_words as string[]).map(String)
    : typeof labels.emphasized_words === 'string'
      ? (labels.emphasized_words as string).split(',').map((w: string) => w.trim()).filter(Boolean)
      : [];

  const confidence = typeof labels.confidence === 'number'
    ? Math.max(0, Math.min(1, labels.confidence))
    : 0.7;

  return {
    turnNo,
    emotion: features.emotion ? get('emotion') || undefined : undefined,
    intent: features.intent ? get('intent') || undefined : undefined,
    speakingRate: features.speakingRate ? get('speaking_rate') || get('speakingRate') || undefined : undefined,
    disfluency: features.disfluency ? disfluency : undefined,
    turnTakingEvent: features.turnTaking ? get('turn_taking_event') || get('turnTakingEvent') || undefined : undefined,
    emphasizedWords: features.emphasis ? emphasizedWords : undefined,
    confidence,
    boundaryError,
    rawResponse: JSON.stringify(labels),
  };
}
