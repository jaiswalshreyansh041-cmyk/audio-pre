/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gemini 2.5 Pro integration.
 * Audio is sent as inline base64 WAV; a single prompt handles
 * transcription + all prosodic label extraction simultaneously.
 */

import { GoogleGenAI } from '@google/genai';
import { AnnotationRow, FeatureToggles, PredictionResult } from '../types';
import { audioBufferToBase64Wav, sliceAudioBuffer } from './audioSlice';
import { buildPrompt, parseModelJSON, SYSTEM_PROMPT } from './promptBuilder';
import { buildPrediction } from './whisperModel';

export async function runGeminiOnTurn(
  buffer: AudioBuffer,
  turn: AnnotationRow,
  prevTurn: AnnotationRow | null,
  features: FeatureToggles,
  apiKey: string,
): Promise<PredictionResult> {
  const slice = sliceAudioBuffer(buffer, turn.startTime, turn.endTime);
  const base64Audio = audioBufferToBase64Wav(slice);

  const ai = new GoogleGenAI({ apiKey });

  const { user } = buildPrompt('', turn, prevTurn, features);

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: base64Audio,
          },
        },
        {
          text:
            `${SYSTEM_PROMPT}\n\n` +
            `The audio above is: Turn ${turn.turnNo}, Speaker: ${turn.speaker}, ` +
            `Time: ${turn.startTime.toFixed(3)}s → ${turn.endTime.toFixed(3)}s\n` +
            `Reference utterance text: ${turn.originalUtterance}\n\n` +
            user,
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  });

  const raw = response.text ?? '{}';
  const labels = parseModelJSON(raw);

  return buildPrediction(turn.turnNo, labels, undefined, features);
}
