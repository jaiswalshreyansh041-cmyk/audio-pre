/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  FileAudio, ChevronRight,
  Activity, Mic2, BrainCircuit, Zap, CheckCircle2,
  FileJson, GitCompareArrows, Cpu, FileText,
} from 'lucide-react';
import { FeatureToggles, ModelType } from '../types';

interface Props {
  model: ModelType | null;
  features: FeatureToggles;
  audioFile: File | null;
  csvFile: File | null;
  compareMode: boolean;
  predictionFile: File | null;
  onModelChange: (m: ModelType) => void;
  onFeaturesChange: (f: FeatureToggles) => void;
  onAudioFile: (f: File) => void;
  onCsvFile: (f: File) => void;
  onCompareModeChange: (v: boolean) => void;
  onPredictionFile: (f: File) => void;
  onRun: () => void;
  onCompare: () => void;
}

const MODELS: { id: ModelType; name: string; subtitle: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'whisper',
    name: 'Whisper AI',
    subtitle: 'OpenAI',
    desc: 'whisper-1 transcription → GPT-4o label extraction. Best for English-heavy code-switching.',
    icon: <Mic2 size={22} />,
    color: '#10b981',
  },
  {
    id: 'gemini',
    name: 'Gemini 3.1 Pro',
    subtitle: 'Google',
    desc: 'Native audio understanding. Single-pass transcription + annotation in one call.',
    icon: <BrainCircuit size={22} />,
    color: '#6366f1',
  },
  {
    id: 'sarvam',
    name: 'Sarvam AI',
    subtitle: 'saarika:v2 + saaras:v1',
    desc: 'Purpose-built for Hindi/Indic languages. Best accuracy on native Hindi speech.',
    icon: <Zap size={22} />,
    color: '#f59e0b',
  },
];

const FEATURE_LIST: { key: keyof FeatureToggles; label: string; desc: string }[] = [
  { key: 'emotion',      label: 'Emotion Detection',     desc: 'Neutral · Confident · Frustrated · Confused · Excited · Skeptical · Surprised' },
  { key: 'intent',       label: 'Intent Classification', desc: 'Question · Request · Statement · Elaboration · Proposal · Agreement · Backchannel' },
  { key: 'speakingRate', label: 'Speaking Rate',         desc: 'Slow · Normal · Fast' },
  { key: 'disfluency',   label: 'Disfluency Detection',  desc: 'Filler · False Start · Self-repair · Repetition · Long Pause · None' },
  { key: 'turnTaking',   label: 'Turn-Taking Event',     desc: 'Normal · Latch · Overlap · Interruption · Long gap' },
  { key: 'emphasis',     label: 'Emphasis / Stress',     desc: 'Token-level F1 against ground-truth stressed words' },
];

function DropZone({
  accept, file, onFile, label, icon, accent = '#6366f1',
}: {
  accept: string; file: File | null; onFile: (f: File) => void;
  label: string; icon: React.ReactNode; accent?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className="cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 p-6 flex flex-col items-center gap-3 select-none"
      style={{
        borderColor: drag ? accent : file ? '#10b981' : 'rgba(255,255,255,0.12)',
        background:  drag ? `${accent}10` : file ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: file ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)' }}>
        {file
          ? <CheckCircle2 size={20} color="#10b981" />
          : <span style={{ color: 'rgba(255,255,255,0.4)' }}>{icon}</span>}
      </div>
      {file ? (
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: '#6ee7b7' }}>{file.name}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Click or drag & drop</p>
        </div>
      )}
    </div>
  );
}

export default function SetupPage({
  model, features, audioFile, csvFile,
  compareMode, predictionFile,
  onModelChange, onFeaturesChange, onAudioFile, onCsvFile,
  onCompareModeChange, onPredictionFile, onRun, onCompare,
}: Props) {
  const activeCount = Object.values(features).filter(Boolean).length;
  const toggleFeature = (key: keyof FeatureToggles) =>
    onFeaturesChange({ ...features, [key]: !features[key] });

  const canRunModel  = model !== null && audioFile !== null && csvFile !== null;
  const canCompare   = csvFile !== null && predictionFile !== null;

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-3"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'linear-gradient(135deg,#12121c,#0f1628)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.2)' }}>
          <Activity size={16} color="#a5b4fc" />
        </div>
        <h1 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
          Prosodic Annotation Evaluator
        </h1>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden border"
          style={{ borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)' }}>
          <ModeBtn
            active={!compareMode}
            onClick={() => onCompareModeChange(false)}
            icon={<Cpu size={14} />}
            label="Run Model"
            sub="Call an AI model on each audio segment"
          />
          <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
          <ModeBtn
            active={compareMode}
            onClick={() => onCompareModeChange(true)}
            icon={<GitCompareArrows size={14} />}
            label="Compare with File"
            sub="Upload existing predictions (JSON or CSV) to compare"
          />
        </div>

        {/* ── RUN MODEL PATH ── */}
        {!compareMode && (
          <>
            {/* Step 1 — Model */}
            <section>
              <SectionHeader number={1} title="Select Model" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                {MODELS.map(m => (
                  <button key={m.id} onClick={() => onModelChange(m.id)}
                    className="rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.01]"
                    style={{
                      background: model === m.id ? `linear-gradient(145deg,${m.color}18,${m.color}08)` : 'linear-gradient(145deg,#1a1a26,#13131c)',
                      borderColor: model === m.id ? m.color : 'rgba(255,255,255,0.07)',
                      boxShadow: model === m.id ? `0 0 20px ${m.color}22` : 'none',
                    }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                      style={{ background: `${m.color}20`, color: m.color }}>{m.icon}</div>
                    <p className="font-semibold text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>{m.name}</p>
                    <p className="text-xs mt-0.5 mb-2" style={{ color: m.color }}>{m.subtitle}</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{m.desc}</p>
                    {model === m.id && (
                      <div className="mt-3 flex items-center gap-1.5">
                        <CheckCircle2 size={12} color={m.color} />
                        <span className="text-xs font-medium" style={{ color: m.color }}>Selected</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Step 2 — Features */}
            <section>
              <SectionHeader number={2} title={`Features to Evaluate  ·  ${activeCount} / ${FEATURE_LIST.length} active`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {FEATURE_LIST.map(f => (
                  <button key={f.key} onClick={() => toggleFeature(f.key)}
                    className="rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.01]"
                    style={{
                      background: features[f.key] ? 'linear-gradient(145deg,rgba(99,102,241,0.12),rgba(99,102,241,0.05))' : 'linear-gradient(145deg,#1a1a26,#13131c)',
                      borderColor: features[f.key] ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)',
                    }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.88)' }}>{f.label}</span>
                      <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: features[f.key] ? '#6366f1' : 'rgba(255,255,255,0.2)', background: features[f.key] ? '#6366f1' : 'transparent' }}>
                        {features[f.key] && <CheckCircle2 size={10} color="white" />}
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>{f.desc}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Step 3 — Upload audio + annotation JSON */}
            <section>
              <SectionHeader number={3} title="Upload Files" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <DropZone accept="audio/mp3,audio/mpeg,audio/wav,audio/x-m4a,audio/flac,.mp3,.wav,.m4a,.flac"
                  file={audioFile} onFile={onAudioFile} label="Audio File  (MP3 / WAV / M4A / FLAC)" icon={<FileAudio size={20} />} />
                <DropZone accept=".json,.csv,application/json,text/csv"
                  file={csvFile} onFile={onCsvFile}
                  accent="#6366f1"
                  label="Annotation File  (JSON or CSV)" icon={<FileJson size={20} />} />
              </div>
            </section>

            <div className="flex justify-end pt-2">
              <button onClick={onRun} disabled={!canRunModel}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                style={{
                  background: canRunModel ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
                  color: canRunModel ? 'white' : 'rgba(255,255,255,0.25)',
                  cursor: canRunModel ? 'pointer' : 'not-allowed',
                  boxShadow: canRunModel ? '0 4px 20px rgba(99,102,241,0.35)' : 'none',
                }}>
                Run accuracy check <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}

        {/* ── COMPARE PATH ── */}
        {compareMode && (
          <>
            {/* Step 1 — Features */}
            <section>
              <SectionHeader number={1} title={`Features to Compare  ·  ${activeCount} / ${FEATURE_LIST.length} active`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {FEATURE_LIST.map(f => (
                  <button key={f.key} onClick={() => toggleFeature(f.key)}
                    className="rounded-xl border p-4 text-left transition-all duration-200 hover:scale-[1.01]"
                    style={{
                      background: features[f.key] ? 'linear-gradient(145deg,rgba(99,102,241,0.12),rgba(99,102,241,0.05))' : 'linear-gradient(145deg,#1a1a26,#13131c)',
                      borderColor: features[f.key] ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)',
                    }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.88)' }}>{f.label}</span>
                      <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: features[f.key] ? '#6366f1' : 'rgba(255,255,255,0.2)', background: features[f.key] ? '#6366f1' : 'transparent' }}>
                        {features[f.key] && <CheckCircle2 size={10} color="white" />}
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>{f.desc}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Step 2 — Upload ground-truth + prediction file */}
            <section>
              <SectionHeader number={2} title="Upload Files" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <DropZone accept=".csv,text/csv"
                  file={csvFile} onFile={onCsvFile}
                  label="Ground-Truth Annotation CSV" icon={<FileText size={20} />} />
                <DropZone accept=".json,.csv,application/json,text/csv"
                  file={predictionFile} onFile={onPredictionFile}
                  accent="#f59e0b"
                  label="Prediction File  (JSON or CSV)" icon={<FileJson size={20} />} />
              </div>

              {/* Format hint */}
              <div className="mt-3 rounded-xl border p-4 space-y-1"
                style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
                <p className="text-xs font-medium" style={{ color: '#fcd34d' }}>Supported prediction file formats</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  • <span style={{ color: 'rgba(255,255,255,0.65)' }}>SunLiya.AI JSON</span> — the downloaded JSON from the SunLiya.AI analysis (ai_analysis.transcript_by_turn)
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  • <span style={{ color: 'rgba(255,255,255,0.65)' }}>Evaluator CSV</span> — a previous evaluation export from this tool
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  • <span style={{ color: 'rgba(255,255,255,0.65)' }}>Generic JSON</span> — any JSON with per-turn emotion / intent / disfluency / emphasis fields
                </p>
              </div>
            </section>

            <div className="flex justify-end pt-2">
              <button onClick={onCompare} disabled={!canCompare}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                style={{
                  background: canCompare ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,0.06)',
                  color: canCompare ? 'white' : 'rgba(255,255,255,0.25)',
                  cursor: canCompare ? 'pointer' : 'not-allowed',
                  boxShadow: canCompare ? '0 4px 20px rgba(245,158,11,0.3)' : 'none',
                }}>
                <GitCompareArrows size={15} /> Compare predictions <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label, sub }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; sub: string;
}) {
  return (
    <button onClick={onClick} className="flex-1 flex items-start gap-3 px-5 py-4 text-left transition-all duration-200"
      style={{ background: active ? 'rgba(99,102,241,0.1)' : 'transparent' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 shrink-0"
        style={{ background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', color: active ? '#a5b4fc' : 'rgba(255,255,255,0.35)' }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)' }}>{sub}</p>
      </div>
    </button>
  );
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>{number}</div>
      <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{title}</h2>
    </div>
  );
}
