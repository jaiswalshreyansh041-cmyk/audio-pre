/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sarvam AI integration.
 * saarika:v2 for Hindi speech-to-text, saaras:v1 for prosodic labeling.
 */

import { AnnotationRow, FeatureToggles, PredictionResult } from '../types';
import { audioBufferToBlob, sliceAudioBuffer } from './audioSlice';
import { buildPrompt, parseModelJSON, SYSTEM_PROMPT } from './promptBuilder';
import { buildPrediction } from './whisperModel';

const SARVAM_STT_ENDPOINT = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_CHAT_ENDPOINT = 'https://api.sarvam.ai/v1/chat/completions';

async function transcribeWithSarvam(
  blob: Blob,
  apiKey: string,
): Promise<string> {
  const fd = new FormData();
  fd.append('file', blob, 'segment.wav');
  fd.append('model', 'saarika:v2');
  fd.append('language_code', 'hi-IN');

  const res = await fetch(SARVAM_STT_ENDPOINT, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey },
    body: fd,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam STT ${res.status}: ${err}`);
  }
  const json = await res.json();
  // Sarvam returns { transcript: string } or { transcription: string }
  return json.transcript || json.transcription || '';
}

async function labelWithSaaras(
  transcript: string,
  turn: AnnotationRow,
  prevTurn: AnnotationRow | null,
  features: FeatureToggles,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const { user } = buildPrompt(transcript, turn, prevTurn, features);

  const res = await fetch(SARVAM_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'saaras:v1',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam Chat ${res.status}: ${err}`);
  }
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content || '{}';
  return parseModelJSON(raw);
}

export async function runSarvamOnTurn(
  buffer: AudioBuffer,
  turn: AnnotationRow,
  prevTurn: AnnotationRow | null,
  features: FeatureToggles,
  apiKey: string,
): Promise<PredictionResult> {
  const slice = sliceAudioBuffer(buffer, turn.startTime, turn.endTime);
  const blob = audioBufferToBlob(slice);

  let transcript = '';
  try {
    transcript = await transcribeWithSarvam(blob, apiKey);
  } catch {
    transcript = turn.originalUtterance;
  }

  const labels = await labelWithSaaras(transcript, turn, prevTurn, features, apiKey);
  return buildPrediction(turn.turnNo, labels, undefined, features);
}
