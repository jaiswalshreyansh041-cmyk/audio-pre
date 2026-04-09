/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parse a prediction file (JSON from SunLiya.AI or CSV from the evaluator's
 * own export) into an array of PredictionResult keyed by turn number.
 */

import Papa from 'papaparse';
import { DisfluencyLabels, PredictionResult } from '../types';
import { parseTimeToSeconds } from './csvParser';

/* ─── helpers ─── */

function parseDisfluencyArray(arr: string[]): DisfluencyLabels {
  const has = (k: string) => arr.some(v => v.toLowerCase().includes(k));
  return {
    filler:     has('filler'),
    falseStart: has('false_start') || has('false start'),
    selfRepair: has('self_repair') || has('self repair'),
    repetition: has('repetition'),
    longPause:  has('long_pause') || has('long pause'),
    none:       has('none') || arr.length === 0,
  };
}

function parseDisfluencyString(val: string): DisfluencyLabels {
  if (!val) return { filler: false, falseStart: false, selfRepair: false, repetition: false, longPause: false, none: true };
  const parts = val.toLowerCase().split(/[,;/|]+/).map(p => p.trim());
  return parseDisfluencyArray(parts);
}

/* ─── SunLiya.AI JSON ─── */

function fromSunLiyaJSON(json: any): PredictionResult[] {
  const turns: any[] = json?.ai_analysis?.transcript_by_turn ?? json?.transcript_by_turn ?? [];
  return turns.map((t: any, idx: number) => {
    // Annotation fields may be nested under t.annotations OR flat on t itself
    const ann = t.annotations ?? {};

    const pick = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = ann[k] ?? t[k];
        if (v && typeof v === 'string' && v.trim()) return v.trim();
      }
      return undefined;
    };

    const rawDisf: string[] = (() => {
      const v = ann.disfluency ?? t.disfluency;
      if (Array.isArray(v)) return v as string[];
      if (typeof v === 'string') return [v];
      return [];
    })();

    const rawEmphasis: string[] = (() => {
      const v = ann.emphasis ?? t.emphasis ?? ann.emphasized_words ?? t.emphasized_words;
      if (Array.isArray(v)) return v as string[];
      if (typeof v === 'string') return v.split(',').map((s: string) => s.trim()).filter(Boolean);
      return [];
    })();

    const emotionRaw  = pick('emotion');
    const intentRaw   = pick('intent');
    const rateRaw     = pick('speaking_rate', 'speakingRate');
    const ttRaw       = pick('turn_taking', 'turn_taking_event', 'turnTakingEvent');

    // Extract timestamps — SunLiya.AI uses MM:SS strings on t.start_time / t.end_time
    // Also check annotation-level keys and numeric fallbacks
    const rawStart = t.start_time ?? t.timestamp_start ?? t.start ?? ann.start_time ?? '';
    const rawEnd   = t.end_time   ?? t.timestamp_end   ?? t.end   ?? ann.end_time   ?? '';
    const startTime = typeof rawStart === 'number' ? rawStart : parseTimeToSeconds(String(rawStart));
    const endTime   = typeof rawEnd   === 'number' ? rawEnd   : parseTimeToSeconds(String(rawEnd));

    return {
      turnNo:          t.turn_id ?? idx + 1,
      startTime:       startTime || undefined,
      endTime:         endTime   || undefined,
      speaker:         t.speaker ?? t.speaker_id ?? ann.speaker ?? undefined,
      emotion:         emotionRaw  ? capitalise(emotionRaw)  : undefined,
      intent:          intentRaw   ? capitalise(intentRaw)   : undefined,
      speakingRate:    rateRaw     ? capitalise(rateRaw)     : undefined,
      disfluency:      parseDisfluencyArray(rawDisf),
      turnTakingEvent: ttRaw       ? toTurnLabel(ttRaw)      : undefined,
      emphasizedWords: rawEmphasis,
      confidence:      ann.confidence ?? t.confidence ?? 0.8,
      boundaryError:   undefined,
    };
  });
}

/* ─── Evaluator-exported CSV ─── */
// Format: Turn No | Speaker | Start Time | End Time | Feature | Ground Truth | Prediction | Match | Confidence | Boundary Error (ms)

function fromEvaluatorCSV(csvText: string): PredictionResult[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  // group rows by turn number
  const byTurn: Record<number, PredictionResult> = {};

  for (const row of parsed.data) {
    const turnNo = parseInt(row['Turn No'] ?? row['turn_no'] ?? '0') || 0;
    const feature = (row['Feature'] ?? '').trim().toLowerCase();
    const pred = (row['Prediction'] ?? '').trim();
    const conf = parseFloat(row['Confidence'] ?? '0') || 0.8;
    const bErr = parseFloat(row['Boundary Error (ms)'] ?? '') || undefined;

    if (!byTurn[turnNo]) {
      byTurn[turnNo] = { turnNo, confidence: conf, boundaryError: bErr };
    }
    const r = byTurn[turnNo];
    r.confidence = conf; // last row wins

    switch (feature) {
      case 'emotion':      r.emotion = pred; break;
      case 'intent':       r.intent  = pred; break;
      case 'speakingrate': r.speakingRate = pred; break;
      case 'disfluency':   r.disfluency = parseDisfluencyString(pred); break;
      case 'turntaking':   r.turnTakingEvent = pred; break;
      case 'emphasis':     r.emphasizedWords = pred ? pred.split(',').map(w => w.trim()).filter(Boolean) : []; break;
    }
    if (bErr !== undefined) r.boundaryError = bErr;
  }

  return Object.values(byTurn).sort((a, b) => a.turnNo - b.turnNo);
}

/* ─── Generic JSON (any structure with per-turn labels) ─── */

function fromGenericJSON(json: any): PredictionResult[] {
  // Try common shapes
  const turns: any[] =
    json?.turns ??
    json?.transcript_by_turn ??
    json?.predictions ??
    (Array.isArray(json) ? json : []);

  return turns.map((t: any, idx: number) => {
    const rawStart = t.start_time ?? t.timestamp_start ?? t.start ?? '';
    const rawEnd   = t.end_time   ?? t.timestamp_end   ?? t.end   ?? '';
    const startTime = typeof rawStart === 'number' ? rawStart : parseTimeToSeconds(String(rawStart));
    const endTime   = typeof rawEnd   === 'number' ? rawEnd   : parseTimeToSeconds(String(rawEnd));
    return {
      turnNo:          t.turn_id ?? t.turn_no ?? t.turnNo ?? idx + 1,
      startTime:       startTime || undefined,
      endTime:         endTime   || undefined,
      speaker:         t.speaker ?? t.speaker_id ?? undefined,
      emotion:         t.emotion ?? t.annotations?.emotion,
      intent:          t.intent ?? t.annotations?.intent,
      speakingRate:    t.speaking_rate ?? t.speakingRate ?? t.annotations?.speaking_rate,
      disfluency:      Array.isArray(t.disfluency ?? t.annotations?.disfluency)
                         ? parseDisfluencyArray(t.disfluency ?? t.annotations?.disfluency)
                         : parseDisfluencyString(t.disfluency ?? t.annotations?.disfluency ?? ''),
      turnTakingEvent: t.turn_taking_event ?? t.turnTakingEvent ?? t.annotations?.turn_taking,
      emphasizedWords: Array.isArray(t.emphasized_words ?? t.annotations?.emphasis)
                         ? (t.emphasized_words ?? t.annotations?.emphasis)
                         : [],
      confidence:      t.confidence ?? 0.8,
      boundaryError:   undefined,
    };
  });
}

/* ─── Public entry point ─── */

export async function parsePredictionFile(file: File): Promise<PredictionResult[]> {
  const text = await file.text();
  const lc = file.name.toLowerCase();

  if (lc.endsWith('.csv')) {
    return fromEvaluatorCSV(text);
  }

  // JSON
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Prediction file is not valid JSON or CSV.');
  }

  // Detect SunLiya.AI output
  if (json?.ai_analysis?.transcript_by_turn || json?.transcript_by_turn) {
    return fromSunLiyaJSON(json);
  }
  return fromGenericJSON(json);
}

/* ─── label normalisers ─── */

function capitalise(s: string): string {
  return s.trim().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toTurnLabel(s: string): string {
  const map: Record<string, string> = {
    'normal_transition': 'Normal transition',
    'normal transition': 'Normal transition',
    'latch': 'Latch',
    'overlap': 'Overlap',
    'interruption': 'Interruption',
    'long_gap': 'Long gap',
    'long gap': 'Long gap',
  };
  return map[s.toLowerCase().trim()] ?? capitalise(s);
}
