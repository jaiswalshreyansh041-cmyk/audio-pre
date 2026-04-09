/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AnnotationRow,
  DisfluencyLabels,
  FeatureMetrics,
  FeatureToggles,
  OverallMetrics,
  PredictionResult,
  TurnResult,
} from '../types';

/* ─── helpers ─── */

function prf(tp: number, fp: number, fn: number) {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function tokenF1(gtWords: string[], predWords: string[]) {
  if (!gtWords.length && !predWords.length) return { precision: 1, recall: 1, f1: 1 };
  if (!gtWords.length) return { precision: 0, recall: 1, f1: 0 };
  if (!predWords.length) return { precision: 1, recall: 0, f1: 0 };
  const gtSet = new Set(gtWords.map(w => w.toLowerCase().trim()));
  const predSet = new Set(predWords.map(w => w.toLowerCase().trim()));
  let tp = 0;
  predSet.forEach(w => { if (gtSet.has(w)) tp++; });
  return prf(tp, predSet.size - tp, gtSet.size - tp);
}

function addToMatrix(
  matrix: Record<string, Record<string, number>>,
  gt: string,
  pred: string,
) {
  if (!matrix[gt]) matrix[gt] = {};
  matrix[gt][pred] = (matrix[gt][pred] || 0) + 1;
}

/* ─── per-turn result ─── */

export function evaluateTurn(
  gt: AnnotationRow,
  pred: PredictionResult,
  features: FeatureToggles,
): TurnResult {
  const matches: Record<string, boolean | 'partial'> = {};
  const featureF1s: Record<string, number> = {};

  if (features.emotion && pred.emotion !== undefined) {
    matches.emotion = gt.emotion.toLowerCase().trim() === pred.emotion.toLowerCase().trim();
  }
  if (features.intent && pred.intent !== undefined) {
    matches.intent = gt.intent.toLowerCase().trim() === pred.intent.toLowerCase().trim();
  }
  if (features.speakingRate && pred.speakingRate !== undefined) {
    matches.speakingRate = gt.speakingRate.toLowerCase().trim() === pred.speakingRate.toLowerCase().trim();
  }
  if (features.disfluency && pred.disfluency !== undefined) {
    const keys: (keyof DisfluencyLabels)[] = ['filler', 'falseStart', 'selfRepair', 'repetition', 'longPause', 'none'];
    let allMatch = true;
    let partialMatch = false;
    for (const k of keys) {
      if (gt.disfluency[k] === pred.disfluency[k]) partialMatch = true;
      else allMatch = false;
    }
    matches.disfluency = allMatch ? true : partialMatch ? 'partial' : false;

    // compute per-turn F1 for disfluency (treat each label as a binary prediction)
    let tpSum = 0, fpSum = 0, fnSum = 0;
    for (const k of keys) {
      const g = gt.disfluency[k] ? 1 : 0;
      const p = pred.disfluency[k] ? 1 : 0;
      tpSum += g && p ? 1 : 0;
      fpSum += !g && p ? 1 : 0;
      fnSum += g && !p ? 1 : 0;
    }
    featureF1s.disfluency = prf(tpSum, fpSum, fnSum).f1;
  }
  if (features.turnTaking && pred.turnTakingEvent !== undefined) {
    matches.turnTaking = gt.turnTakingEvent.toLowerCase().trim() === pred.turnTakingEvent.toLowerCase().trim();
  }
  if (features.emphasis && pred.emphasizedWords !== undefined) {
    const { f1 } = tokenF1(gt.emphasis, pred.emphasizedWords);
    featureF1s.emphasis = f1;
    matches.emphasis = f1 > 0.5 ? true : f1 > 0 ? 'partial' : false;
  }

  return { groundTruth: gt, prediction: pred, matches, featureF1s };
}

/* ─── aggregate across all turns ─── */

interface FeatureAccum {
  tp: number; fp: number; fn: number; correct: number; total: number;
  confidence: number; confMatrix: Record<string, Record<string, number>>;
  f1Sum: number; f1Count: number;
}

function newAccum(): FeatureAccum {
  return { tp: 0, fp: 0, fn: 0, correct: 0, total: 0, confidence: 0, confMatrix: {}, f1Sum: 0, f1Count: 0 };
}

const FEATURE_LABELS: Record<string, string> = {
  emotion: 'Emotion Detection',
  intent: 'Intent Classification',
  speakingRate: 'Speaking Rate',
  disfluency: 'Disfluency Detection',
  turnTaking: 'Turn-Taking Event',
  emphasis: 'Emphasis / Stress',
};

const DISFLUENCY_KEYS: (keyof DisfluencyLabels)[] = [
  'filler', 'falseStart', 'selfRepair', 'repetition', 'longPause', 'none'
];

export function computeOverallMetrics(
  results: TurnResult[],
  features: FeatureToggles,
): OverallMetrics {
  const accum: Record<string, FeatureAccum> = {};
  const speakerAccum: Record<string, { correct: number; total: number }> = {};
  const durationAccum: Record<string, { correct: number; total: number }> = {
    '<5s': { correct: 0, total: 0 },
    '5–15s': { correct: 0, total: 0 },
    '>15s': { correct: 0, total: 0 },
  };

  const activeFeatures = Object.entries(features)
    .filter(([, v]) => v)
    .map(([k]) => k) as (keyof FeatureToggles)[];

  for (const f of activeFeatures) accum[f] = newAccum();

  let totalConfidence = 0;
  let confidenceCount = 0;
  let alignedTurns = 0;
  let totalAlignTurns = 0;
  let boundaryErrorSum = 0;

  for (const r of results) {
    if (!r.prediction) continue;
    const { groundTruth: gt, prediction: pred, matches, featureF1s } = r;

    const dur = gt.endTime - gt.startTime;
    const bucket = dur < 5 ? '<5s' : dur <= 15 ? '5–15s' : '>15s';

    const spk = gt.speaker || 'Unknown';
    if (!speakerAccum[spk]) speakerAccum[spk] = { correct: 0, total: 0 };

    totalConfidence += pred.confidence || 0;
    confidenceCount++;

    // Timestamp alignment
    if (pred.boundaryError !== undefined) {
      totalAlignTurns++;
      boundaryErrorSum += pred.boundaryError;
      if (pred.boundaryError <= 150) alignedTurns++;
    }

    let turnAnyCorrect = false;
    let turnActiveCount = 0;

    for (const f of activeFeatures) {
      const a = accum[f];

      if (f === 'disfluency') {
        if (!pred.disfluency) continue;
        a.total++;
        a.confidence += pred.confidence || 0;
        // Per-sublabel F1 for accum
        for (const k of DISFLUENCY_KEYS) {
          const g = gt.disfluency[k];
          const p = pred.disfluency[k];
          if (g && p) a.tp++;
          else if (!g && p) a.fp++;
          else if (g && !p) a.fn++;
        }
        const turnF1 = featureF1s.disfluency ?? 0;
        a.f1Sum += turnF1;
        a.f1Count++;
        if (turnF1 > 0.5) { a.correct++; turnAnyCorrect = true; }
        turnActiveCount++;

      } else if (f === 'emphasis') {
        if (!pred.emphasizedWords) continue;
        a.total++;
        a.confidence += pred.confidence || 0;
        const turnF1 = featureF1s.emphasis ?? 0;
        a.f1Sum += turnF1;
        a.f1Count++;
        if (turnF1 > 0.5) { a.correct++; turnAnyCorrect = true; }
        turnActiveCount++;

      } else {
        // exact match features
        const gtVal = f === 'emotion' ? gt.emotion
          : f === 'intent' ? gt.intent
          : f === 'speakingRate' ? gt.speakingRate
          : gt.turnTakingEvent;
        const predVal = f === 'emotion' ? pred.emotion
          : f === 'intent' ? pred.intent
          : f === 'speakingRate' ? pred.speakingRate
          : pred.turnTakingEvent;
        if (predVal === undefined) continue;
        a.total++;
        a.confidence += pred.confidence || 0;
        const correct = matches[f] === true;
        if (correct) { a.correct++; a.tp++; turnAnyCorrect = true; }
        else { a.fn++; }
        addToMatrix(a.confMatrix, gtVal.toLowerCase(), predVal.toLowerCase());
        turnActiveCount++;
      }
    }

    // Per-speaker + per-duration (average over active features in this turn)
    if (turnActiveCount > 0) {
      speakerAccum[spk].total++;
      if (turnAnyCorrect) speakerAccum[spk].correct++;
      durationAccum[bucket].total++;
      if (turnAnyCorrect) durationAccum[bucket].correct++;
    }
  }

  // Build per-feature metrics
  const perFeature: FeatureMetrics[] = activeFeatures.map(f => {
    const a = accum[f];
    const { precision, recall, f1 } = f === 'disfluency' || f === 'emphasis'
      ? { precision: 0, recall: 0, f1: a.f1Count > 0 ? a.f1Sum / a.f1Count : 0 }
      : prf(a.tp, a.fp, a.fn);
    return {
      feature: f,
      label: FEATURE_LABELS[f],
      accuracy: a.total > 0 ? (a.correct / a.total) * 100 : 0,
      precision,
      recall,
      f1,
      avgConfidence: a.total > 0 ? a.confidence / a.total : 0,
      correctTurns: a.correct,
      totalTurns: a.total,
      confusionMatrix: a.confMatrix,
    };
  });

  // Overall accuracy = average of per-feature accuracies
  const overallAccuracy = perFeature.length > 0
    ? perFeature.reduce((s, f) => s + f.accuracy, 0) / perFeature.length
    : 0;

  const turnsMatched = results.filter(r =>
    r.prediction && Object.values(r.matches).some(v => v === true)
  ).length;

  const perSpeaker: Record<string, { accuracy: number; turns: number }> = {};
  for (const [spk, { correct, total }] of Object.entries(speakerAccum)) {
    perSpeaker[spk] = {
      accuracy: total > 0 ? (correct / total) * 100 : 0,
      turns: total,
    };
  }

  const byDuration = Object.entries(durationAccum).map(([bucket, { correct, total }]) => ({
    bucket,
    accuracy: total > 0 ? (correct / total) * 100 : 0,
    count: total,
  }));

  return {
    overallAccuracy,
    turnsMatched,
    totalTurns: results.filter(r => r.prediction).length,
    featuresChecked: activeFeatures.length,
    avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    perFeature,
    perSpeaker,
    byDuration,
    timestampAlignment: {
      alignedTurns,
      totalTurns: totalAlignTurns,
      meanBoundaryErrorMs: totalAlignTurns > 0 ? boundaryErrorSum / totalAlignTurns : 0,
      alignmentScore: totalAlignTurns > 0 ? (alignedTurns / totalAlignTurns) * 100 : 0,
    },
  };
}
