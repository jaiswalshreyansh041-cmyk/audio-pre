/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Prosodic Annotation Evaluator — Main orchestrator.
 * Pages: Setup → Processing → Results
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import SetupPage from './components/SetupPage';
import ProcessingPage from './components/ProcessingPage';
import ResultsPage from './components/ResultsPage';

import { parseAnnotationFile } from './utils/csvParser';
import { decodeAudioFile } from './utils/audioSlice';
import { evaluateTurn, computeOverallMetrics } from './utils/metrics';
import { runWhisperOnTurn } from './utils/whisperModel';
import { runGeminiOnTurn } from './utils/geminiModel';
import { runSarvamOnTurn } from './utils/sarvamModel';
import { parsePredictionFile } from './utils/predictionParser';

import {
  AppConfig, AppPage, AnnotationRow, FeatureToggles, ModelType,
  OverallMetrics, ProcessingStep, TurnResult,
} from './types';

/* ─── Constants ─── */

const DEFAULT_FEATURES: FeatureToggles = {
  emotion: true,
  intent: true,
  speakingRate: true,
  disfluency: true,
  turnTaking: true,
  emphasis: true,
};

const MODEL_NAMES: Record<ModelType, string> = {
  whisper: 'Whisper AI + GPT-4o',
  gemini:  'Gemini 3.1 Pro',
  sarvam:  'Sarvam AI (saarika:v2)',
};

const STEP_TEMPLATES = [
  'Loading audio',
  'Segmenting turns from timestamps',
  'Running model on each segment',
  'Comparing predictions to ground truth',
  'Computing accuracy metrics',
];

const COMPARE_STEP_TEMPLATES = [
  'Parsing ground-truth CSV',
  'Parsing prediction file',
  'Matching turns',
  'Comparing predictions to ground truth',
  'Computing accuracy metrics',
];

const INTER_CALL_DELAY_MS = 200;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/* ─── App ─── */

export default function EvaluatorApp() {
  const [page, setPage] = useState<AppPage>('setup');

  // Setup state
  const [model, setModel]           = useState<ModelType | null>(null);
  const [features, setFeatures]     = useState<FeatureToggles>(DEFAULT_FEATURES);
  const [audioFile, setAudioFile]   = useState<File | null>(null);
  const [csvFile, setCsvFile]       = useState<File | null>(null);
  const [compareMode, setCompareMode]         = useState(false);
  const [predictionFile, setPredictionFile]   = useState<File | null>(null);

  // Config (API keys)
  const [config, setConfig] = useState<AppConfig>({
    geminiApiKey: '', openaiApiKey: '', sarvamApiKey: '',
  });

  // Processing state
  const [steps, setSteps] = useState<ProcessingStep[]>(
    STEP_TEMPLATES.map(label => ({ label, status: 'pending' as const }))
  );
  const [currentTurn, setCurrentTurn]   = useState(0);
  const [totalTurns, setTotalTurns]     = useState(0);
  const [etaSeconds, setEtaSeconds]     = useState<number | null>(null);
  const [errors, setErrors]             = useState<string[]>([]);

  // Results state
  const [results, setResults]   = useState<TurnResult[]>([]);
  const [metrics, setMetrics]   = useState<OverallMetrics | null>(null);
  const [runLabel, setRunLabel] = useState('');

  const abortRef = useRef(false);

  /* ─── Load API keys from Vite env (works in dev + Vercel production) ─── */
  useEffect(() => {
    setConfig({
      geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
      openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
      sarvamApiKey: import.meta.env.VITE_SARVAM_API_KEY || '',
    });
  }, []);

  /* ─── Step helpers ─── */
  const setStepStatus = useCallback(
    (index: number, status: ProcessingStep['status']) =>
      setSteps(prev => prev.map((s, i) => i === index ? { ...s, status } : s)),
    []
  );

  const resetProcessingState = useCallback((templates: string[]) => {
    abortRef.current = false;
    setSteps(templates.map(label => ({ label, status: 'pending' as const })));
    setCurrentTurn(0);
    setTotalTurns(0);
    setEtaSeconds(null);
    setErrors([]);
    setResults([]);
    setMetrics(null);
  }, []);

  /* ─── MODEL RUN pipeline ─── */
  const runEvaluation = useCallback(async () => {
    if (!model || !audioFile || !csvFile) return;
    resetProcessingState(STEP_TEMPLATES);
    setRunLabel(MODEL_NAMES[model]);
    setPage('processing');

    try {
      setStepStatus(0, 'active');
      let audioBuffer: AudioBuffer;
      try { audioBuffer = await decodeAudioFile(audioFile); }
      catch (e) { throw new Error(`Failed to decode audio: ${e}`); }
      setStepStatus(0, 'done');

      setStepStatus(1, 'active');
      let annotations: AnnotationRow[];
      try {
        annotations = await parseAnnotationFile(csvFile!);
        if (annotations.length === 0) throw new Error('No annotation rows found in CSV.');
      } catch (e) { throw new Error(`Failed to parse CSV: ${e}`); }
      setTotalTurns(annotations.length);
      setStepStatus(1, 'done');

      setStepStatus(2, 'active');
      const apiKey = model === 'whisper' ? config.openaiApiKey
        : model === 'gemini' ? config.geminiApiKey
        : config.sarvamApiKey;

      if (!apiKey) throw new Error(
        `No API key for ${MODEL_NAMES[model]}. Set it in your .env file.`
      );

      const turnResults: TurnResult[] = [];
      const startTime = Date.now();

      for (let i = 0; i < annotations.length; i++) {
        if (abortRef.current) break;
        setCurrentTurn(i);
        if (i > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          setEtaSeconds((elapsed / i) * (annotations.length - i));
        }
        // Normalise zero turn numbers so display is always meaningful
        const turn = (!annotations[i].turnNo || annotations[i].turnNo === 0)
          ? { ...annotations[i], turnNo: i + 1 }
          : annotations[i];
        const prevTurn = i > 0 ? annotations[i - 1] : null;
        try {
          let prediction;
          if (model === 'whisper')      prediction = await runWhisperOnTurn(audioBuffer, turn, prevTurn, features, apiKey);
          else if (model === 'gemini')  prediction = await runGeminiOnTurn(audioBuffer, turn, prevTurn, features, apiKey);
          else                          prediction = await runSarvamOnTurn(audioBuffer, turn, prevTurn, features, apiKey);
          turnResults.push(evaluateTurn(turn, prediction, features));
        } catch (e) {
          const msg = `Turn ${turn.turnNo}: ${e instanceof Error ? e.message : String(e)}`;
          setErrors(prev => [...prev, msg]);
          turnResults.push({ groundTruth: turn, prediction: null, matches: {}, featureF1s: {} });
        }
        await sleep(INTER_CALL_DELAY_MS);
      }
      setStepStatus(2, 'done');

      setStepStatus(3, 'active');
      setResults(turnResults);
      setStepStatus(3, 'done');

      setStepStatus(4, 'active');
      setMetrics(computeOverallMetrics(turnResults, features));
      setStepStatus(4, 'done');

      await sleep(600);
      setPage('results');

    } catch (fatal) {
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
      setErrors(prev => [...prev, `Fatal: ${fatal instanceof Error ? fatal.message : String(fatal)}`]);
    }
  }, [model, audioFile, csvFile, features, config, setStepStatus, resetProcessingState]);

  /* ─── COMPARE pipeline ─── */
  const runComparison = useCallback(async () => {
    if (!csvFile || !predictionFile) return;
    resetProcessingState(COMPARE_STEP_TEMPLATES);
    setRunLabel(`Compare — ${predictionFile.name}`);
    setPage('processing');

    try {
      // Step 1: parse ground truth
      setStepStatus(0, 'active');
      let annotations: AnnotationRow[];
      try {
        annotations = await parseAnnotationFile(csvFile!);
        if (annotations.length === 0) throw new Error('No annotation rows found in CSV.');
      } catch (e) { throw new Error(`Failed to parse CSV: ${e}`); }
      setTotalTurns(annotations.length);
      setStepStatus(0, 'done');

      // Step 2: parse predictions
      setStepStatus(1, 'active');
      let predictions: import('./types').PredictionResult[];
      try { predictions = await parsePredictionFile(predictionFile); }
      catch (e) { throw new Error(`Failed to parse prediction file: ${e}`); }
      setStepStatus(1, 'done');

      // Step 3: match turns
      setStepStatus(2, 'active');
      const predByTurn  = new Map(predictions.map(p => [p.turnNo, p]));
      // Check if GT turn numbers are meaningful (not all zero/missing)
      const allZero = annotations.every(a => !a.turnNo || a.turnNo === 0);
      setStepStatus(2, 'done');

      // Step 4: evaluate each turn
      setStepStatus(3, 'active');
      const turnResults: TurnResult[] = annotations.map((gt, i) => {
        setCurrentTurn(i);
        // Match by turn number first; fall back to sequential index
        const pred = (!allZero && predByTurn.get(gt.turnNo))
          ?? predByTurn.get(i + 1)
          ?? predictions[i]
          ?? null;
        // Backfill GT with timestamps/speaker from prediction file when GT has none
        const normalised: typeof gt = {
          ...gt,
          turnNo:   (allZero || !gt.turnNo) ? (i + 1) : gt.turnNo,
          startTime: gt.startTime || (pred && pred.startTime) || 0,
          endTime:   gt.endTime   || (pred && pred.endTime)   || 0,
          speaker:   gt.speaker   || (pred && pred.speaker)   || '',
        };
        if (!pred) return { groundTruth: normalised, prediction: null, matches: {}, featureF1s: {} };
        return evaluateTurn(normalised, pred, features);
      });
      setResults(turnResults);
      setStepStatus(3, 'done');

      // Step 5: compute metrics
      setStepStatus(4, 'active');
      setMetrics(computeOverallMetrics(turnResults, features));
      setStepStatus(4, 'done');

      await sleep(400);
      setPage('results');

    } catch (fatal) {
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
      setErrors(prev => [...prev, `Fatal: ${fatal instanceof Error ? fatal.message : String(fatal)}`]);
    }
  }, [csvFile, predictionFile, features, setStepStatus, resetProcessingState]);

  const handleReset = () => {
    abortRef.current = true;
    setPage('setup');
    setResults([]);
    setMetrics(null);
  };

  /* ─── Render ─── */
  if (page === 'setup') {
    return (
      <SetupPage
        model={model}
        features={features}
        audioFile={audioFile}
        csvFile={csvFile}
        compareMode={compareMode}
        predictionFile={predictionFile}
        onModelChange={setModel}
        onFeaturesChange={setFeatures}
        onAudioFile={setAudioFile}
        onCsvFile={setCsvFile}
        onCompareModeChange={setCompareMode}
        onPredictionFile={setPredictionFile}
        onRun={runEvaluation}
        onCompare={runComparison}
      />
    );
  }

  if (page === 'processing') {
    return (
      <ProcessingPage
        steps={steps}
        currentTurn={currentTurn}
        totalTurns={totalTurns}
        modelName={runLabel}
        etaSeconds={etaSeconds}
        errors={errors}
      />
    );
  }

  if (page === 'results' && metrics) {
    return (
      <ResultsPage
        metrics={metrics}
        results={results}
        features={features}
        modelName={runLabel}
        onReset={handleReset}
      />
    );
  }

  return null;
}
