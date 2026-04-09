/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DisfluencyLabels {
  filler: boolean;
  falseStart: boolean;
  selfRepair: boolean;
  repetition: boolean;
  longPause: boolean;
  none: boolean;
}

export interface AnnotationRow {
  taskId: string;
  turnNo: number;
  speaker: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  originalUtterance: string;
  emotion: string;
  intent: string;
  speakingRate: string;
  disfluency: DisfluencyLabels;
  turnTakingEvent: string;
  emphasis: string[]; // list of stressed words
  annotatorNotes: string;
}

export interface PredictionResult {
  turnNo: number;
  // Timestamps extracted from prediction file (used to backfill GT when missing)
  startTime?: number;
  endTime?: number;
  speaker?: string;
  emotion?: string;
  intent?: string;
  speakingRate?: string;
  disfluency?: DisfluencyLabels;
  turnTakingEvent?: string;
  emphasizedWords?: string[];
  confidence: number;
  boundaryError?: number; // ms
  error?: string;
  rawResponse?: string;
}

export interface FeatureToggles {
  emotion: boolean;
  intent: boolean;
  speakingRate: boolean;
  disfluency: boolean;
  turnTaking: boolean;
  emphasis: boolean;
}

export type ModelType = 'whisper' | 'gemini' | 'sarvam';

export interface TurnResult {
  groundTruth: AnnotationRow;
  prediction: PredictionResult | null;
  matches: Record<string, boolean | 'partial'>;
  featureF1s: Record<string, number>;
}

export interface FeatureMetrics {
  feature: string;
  label: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  avgConfidence: number;
  correctTurns: number;
  totalTurns: number;
  confusionMatrix: Record<string, Record<string, number>>;
}

export interface OverallMetrics {
  overallAccuracy: number;
  turnsMatched: number;
  totalTurns: number;
  featuresChecked: number;
  avgConfidence: number;
  perFeature: FeatureMetrics[];
  perSpeaker: Record<string, { accuracy: number; turns: number }>;
  byDuration: { bucket: string; accuracy: number; count: number }[];
  timestampAlignment: {
    alignedTurns: number;
    totalTurns: number;
    meanBoundaryErrorMs: number;
    alignmentScore: number; // % within ±150ms
  };
}

export interface AppConfig {
  geminiApiKey: string;
  openaiApiKey: string;
  sarvamApiKey: string;
}

export type AppPage = 'setup' | 'processing' | 'results';

export interface ProcessingStep {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}
