/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Download, RotateCcw, CheckCircle2, XCircle, Minus } from 'lucide-react';
import { OverallMetrics, TurnResult, FeatureToggles } from '../types';
import { exportResultsCSV } from '../utils/csvParser';
import { computeSpeakingRate } from '../utils/speakingRate';

interface Props {
  metrics: OverallMetrics;
  results: TurnResult[];
  features: FeatureToggles;
  modelName: string;
  onReset: () => void;
}

type TabId = 'breakdown' | 'errors' | 'timestamps';

/* ─── Helpers ─── */

function pct(n: number) { return `${n.toFixed(1)}%`; }
function conf(n: number) { return `${(n * 100).toFixed(0)}%`; }

function MatchBadge({ v }: { v: boolean | 'partial' | undefined }) {
  if (v === true) return <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#6ee7b7' }}><CheckCircle2 size={12} />  Match</span>;
  if (v === 'partial') return <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#fcd34d' }}><Minus size={12} />  Partial</span>;
  if (v === false) return <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#fca5a5' }}><XCircle size={12} />  Miss</span>;
  return <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4"
      style={{ background: 'linear-gradient(145deg,#1a1a26,#13131c)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
    </div>
  );
}

/* ─── Tab 1: Per-turn breakdown ─── */

function BreakdownTab({ results, features }: { results: TurnResult[]; features: FeatureToggles }) {
  const [filterFeature, setFilterFeature] = useState<string>('all');
  const [filterSpeaker, setFilterSpeaker] = useState<string>('all');
  const [filterMatch, setFilterMatch] = useState<string>('all');

  const speakers = [...new Set(results.map(r => r.groundTruth.speaker))];
  const featureKeys = Object.entries(features).filter(([, v]) => v).map(([k]) => k);

  const filtered = results.filter(r => {
    if (!r.prediction) return false;
    if (filterSpeaker !== 'all' && r.groundTruth.speaker !== filterSpeaker) return false;
    if (filterMatch !== 'all') {
      const anyMatch = Object.values(r.matches);
      if (filterMatch === 'match' && !anyMatch.some(v => v === true)) return false;
      if (filterMatch === 'miss' && !anyMatch.some(v => v === false)) return false;
      if (filterMatch === 'partial' && !anyMatch.some(v => v === 'partial')) return false;
    }
    return true;
  });

  const fmtTime = (s: number) => `${s.toFixed(1)}s`;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select label="Feature" value={filterFeature} onChange={setFilterFeature}
          options={[['all', 'All features'], ...featureKeys.map(k => [k, k] as [string, string])]} />
        <Select label="Speaker" value={filterSpeaker} onChange={setFilterSpeaker}
          options={[['all', 'All speakers'], ...speakers.map(s => [s, s] as [string, string])]} />
        <Select label="Match" value={filterMatch} onChange={setFilterMatch}
          options={[['all', 'All'], ['match', 'Match ✓'], ['partial', 'Partial ~'], ['miss', 'Miss ✗']]} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Turn', 'Speaker', 'Time', ...featureKeys.map(k => k)].map(col => (
                <th key={col} className="px-3 py-2.5 text-left font-medium capitalize"
                  style={{ color: 'rgba(255,255,255,0.45)' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const gt = r.groundTruth;
              const pred = r.prediction;
              return (
                <tr key={i} className="border-b transition-colors hover:bg-white/[0.02]"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="px-3 py-2.5 font-mono font-medium" style={{ color: '#a5b4fc' }}>#{gt.turnNo}</td>
                  <td className="px-3 py-2.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{gt.speaker}</td>
                  <td className="px-3 py-2.5 font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {fmtTime(gt.startTime)}–{fmtTime(gt.endTime)}
                  </td>
                  {featureKeys.map(fk => {
                    const gtVal = getGTVal(gt, fk);
                    const predVal = pred ? getPredVal(pred, fk) : '—';
                    return (
                      <td key={fk} className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          <div style={{ color: 'rgba(255,255,255,0.55)' }}>{gtVal}</div>
                          <div style={{ color: 'rgba(165,180,252,0.8)' }}>{predVal}</div>
                          <MatchBadge v={r.matches[fk]} />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No turns match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Tab 2: Error analysis ─── */

function ErrorTab({ metrics }: { metrics: OverallMetrics }) {
  return (
    <div className="space-y-6">
      {metrics.perFeature.map(fm => {
        const entries = Object.entries(fm.confusionMatrix);
        if (entries.length === 0) {
          return (
            <div key={fm.feature} className="rounded-xl border p-4"
              style={{ background: 'linear-gradient(145deg,#1a1a26,#13131c)', borderColor: 'rgba(255,255,255,0.07)' }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.8)' }}>{fm.label}</h3>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                F1: {fm.f1.toFixed(3)} · Accuracy: {pct(fm.accuracy)}
              </p>
            </div>
          );
        }

        // Build confusion matrix labels
        const allLabels = [...new Set([
          ...Object.keys(fm.confusionMatrix),
          ...Object.values(fm.confusionMatrix).flatMap(v => Object.keys(v)),
        ])];

        return (
          <div key={fm.feature} className="rounded-xl border p-4"
            style={{ background: 'linear-gradient(145deg,#1a1a26,#13131c)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <h3 className="text-sm font-semibold mb-0.5" style={{ color: 'rgba(255,255,255,0.85)' }}>{fm.label}</h3>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Accuracy {pct(fm.accuracy)} · F1 {fm.f1.toFixed(3)} · Precision {fm.precision.toFixed(3)} · Recall {fm.recall.toFixed(3)}
            </p>
            <ConfusionMatrix labels={allLabels} matrix={fm.confusionMatrix} />
          </div>
        );
      })}
    </div>
  );
}

function ConfusionMatrix({
  labels,
  matrix,
}: {
  labels: string[];
  matrix: Record<string, Record<string, number>>;
}) {
  const max = Math.max(1, ...Object.values(matrix).flatMap(row => Object.values(row)));
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-right" style={{ color: 'rgba(255,255,255,0.3)' }}>GT ↓ / Pred →</th>
            {labels.map(l => (
              <th key={l} className="px-2 py-1 text-center capitalize font-medium"
                style={{ color: 'rgba(255,255,255,0.5)' }}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map(gt => (
            <tr key={gt}>
              <td className="px-2 py-1 text-right capitalize font-medium"
                style={{ color: 'rgba(255,255,255,0.5)' }}>{gt}</td>
              {labels.map(pred => {
                const n = matrix[gt]?.[pred] || 0;
                const isDiag = gt === pred;
                const bg = isDiag
                  ? `rgba(16,185,129,${(n / max) * 0.6 + 0.05})`
                  : n > 0 ? `rgba(239,68,68,${(n / max) * 0.5 + 0.03})` : 'transparent';
                return (
                  <td key={pred} className="px-3 py-1.5 text-center rounded"
                    style={{ background: bg, color: n > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)' }}>
                    {n || '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Tab 3: Timestamp alignment ─── */

function TimestampTab({ results, metrics }: { results: TurnResult[]; metrics: OverallMetrics }) {
  const aln = metrics.timestampAlignment;
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Alignment Score" value={pct(aln.alignmentScore)} sub="turns within ±150ms" />
        <StatCard label="Mean Boundary Error" value={`${aln.meanBoundaryErrorMs.toFixed(0)}ms`} sub="avg absolute deviation" />
        <StatCard label="Aligned Turns" value={`${aln.alignedTurns}`} sub={`of ${aln.totalTurns} turns evaluated`} />
        <StatCard label="Misaligned Turns" value={`${aln.totalTurns - aln.alignedTurns}`} sub=">300ms boundary error" />
      </div>

      {/* Per-turn alignment table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Turn', 'Speaker', 'GT Start–End', 'Duration', 'Boundary Error', 'Status'].map(col => (
                <th key={col} className="px-3 py-2.5 text-left font-medium"
                  style={{ color: 'rgba(255,255,255,0.45)' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.filter(r => r.prediction).map((r, i) => {
              const gt = r.groundTruth;
              const err = r.prediction?.boundaryError;
              const dur = gt.endTime - gt.startTime;
              const misaligned = err !== undefined && err > 300;
              return (
                <tr key={i} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="px-3 py-2 font-mono" style={{ color: '#a5b4fc' }}>#{gt.turnNo}</td>
                  <td className="px-3 py-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{gt.speaker}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {gt.startTime.toFixed(2)}s – {gt.endTime.toFixed(2)}s
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {dur.toFixed(1)}s
                  </td>
                  <td className="px-3 py-2 font-mono"
                    style={{ color: err === undefined ? 'rgba(255,255,255,0.25)' : misaligned ? '#fca5a5' : '#6ee7b7' }}>
                    {err !== undefined ? `${err.toFixed(0)}ms` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {err === undefined ? (
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>N/A</span>
                    ) : misaligned ? (
                      <span className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>Misaligned</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(16,185,129,0.13)', color: '#6ee7b7' }}>Aligned</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main ResultsPage ─── */

export default function ResultsPage({ metrics, results, features, modelName, onReset }: Props) {
  const [tab, setTab] = useState<TabId>('breakdown');

  const barData = metrics.perFeature.map(f => ({
    name: f.label.replace(' Detection', '').replace(' Classification', ''),
    accuracy: parseFloat(f.accuracy.toFixed(1)),
    f1: parseFloat((f.f1 * 100).toFixed(1)),
    feature: f.feature,
  }));

  const handleExport = () => {
    const rows = results.flatMap(r => {
      if (!r.prediction) return [];
      const gt = r.groundTruth;
      const pred = r.prediction;
      const featureKeys = Object.entries(features).filter(([, v]) => v).map(([k]) => k);
      return featureKeys.map(fk => ({
        'Turn No': gt.turnNo,
        'Speaker': gt.speaker,
        'Start Time': gt.startTime.toFixed(3),
        'End Time': gt.endTime.toFixed(3),
        'Feature': fk,
        'Ground Truth': getGTVal(gt, fk),
        'Prediction': getPredVal(pred, fk),
        'Match': String(r.matches[fk] ?? 'N/A'),
        'Confidence': pred.confidence.toFixed(3),
        'Boundary Error (ms)': pred.boundaryError != null ? pred.boundaryError.toFixed(0) : '',
      }));
    });

    const csv = exportResultsCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval_results_${modelName}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: 'breakdown', label: 'Per-turn breakdown' },
    { id: 'errors', label: 'Error analysis' },
    { id: 'timestamps', label: 'Timestamp alignment' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'linear-gradient(135deg,#12121c,#0f1628)' }}>
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Evaluation Results</h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Model: {modelName}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
            <Download size={12} /> Export CSV
          </button>
          <button onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <RotateCcw size={12} /> New run
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Overall Accuracy" value={pct(metrics.overallAccuracy)} sub="avg across active features" />
          <StatCard label="Turns Matched" value={`${metrics.turnsMatched} / ${metrics.totalTurns}`} sub="at least one feature" />
          <StatCard label="Features Checked" value={`${metrics.featuresChecked}`} sub="active features" />
          <StatCard label="Avg Confidence" value={conf(metrics.avgConfidence)} sub="model self-reported" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Accuracy bar chart */}
          <div className="rounded-xl border p-5"
            style={{ background: 'linear-gradient(145deg,#1a1a26,#13131c)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <h3 className="text-xs font-semibold mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Accuracy by feature
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
                  tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" width={110}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)}%`, String(name)]}
                  contentStyle={{ background: '#13131c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                />
                <Bar
                  dataKey="accuracy"
                  radius={[0, 4, 4, 0]}
                  fill="#6366f1"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-speaker accuracy */}
          <div className="rounded-xl border p-5"
            style={{ background: 'linear-gradient(145deg,#1a1a26,#13131c)', borderColor: 'rgba(255,255,255,0.07)' }}>
            <h3 className="text-xs font-semibold mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Per-speaker accuracy
            </h3>
            <div className="space-y-3 mb-6">
              {Object.entries(metrics.perSpeaker).map(([spk, { accuracy, turns }]) => (
                <div key={spk}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{spk}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>{pct(accuracy)}  ·  {turns} turns</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${accuracy}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Accuracy by turn duration
            </h3>
            <div className="space-y-2">
              {metrics.byDuration.map(({ bucket, accuracy, count }) => (
                <div key={bucket}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{bucket}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>{pct(accuracy)}  ·  {count} turns</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${accuracy}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 border-b mb-5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: tab === t.id ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                  borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
                  marginBottom: -1,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'breakdown' && <BreakdownTab results={results} features={features} />}
          {tab === 'errors' && <ErrorTab metrics={metrics} />}
          {tab === 'timestamps' && <TimestampTab results={results} metrics={metrics} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared helpers ─── */

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs rounded-lg px-2 py-1"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.7)',
          outline: 'none',
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} style={{ background: '#1a1a26' }}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function getGTVal(gt: TurnResult['groundTruth'], feature: string): string {
  switch (feature) {
    case 'emotion': return gt.emotion;
    case 'intent': return gt.intent;
    case 'speakingRate': {
      const r = computeSpeakingRate(gt.originalUtterance, gt.startTime, gt.endTime);
      const wpmSuffix = r.durationSec > 0.2 ? ` (${r.wpm} WPM)` : '';
      return `${gt.speakingRate}${wpmSuffix}`;
    }
    case 'disfluency': {
      const d = gt.disfluency;
      const active = [
        d.filler && 'Filler',
        d.falseStart && 'FalseStart',
        d.selfRepair && 'SelfRepair',
        d.repetition && 'Repetition',
        d.longPause && 'LongPause',
        d.none && 'None',
      ].filter(Boolean);
      return active.join(', ') || 'None';
    }
    case 'turnTaking': return gt.turnTakingEvent;
    case 'emphasis': return gt.emphasis.join(', ') || '—';
    default: return '—';
  }
}

function getPredVal(pred: TurnResult['prediction'], feature: string): string {
  if (!pred) return '—';
  switch (feature) {
    case 'emotion': return pred.emotion || '—';
    case 'intent': return pred.intent || '—';
    case 'speakingRate': return pred.speakingRate || '—';
    case 'disfluency': {
      if (!pred.disfluency) return '—';
      const d = pred.disfluency;
      const active = [
        d.filler && 'Filler',
        d.falseStart && 'FalseStart',
        d.selfRepair && 'SelfRepair',
        d.repetition && 'Repetition',
        d.longPause && 'LongPause',
        d.none && 'None',
      ].filter(Boolean);
      return active.join(', ') || 'None';
    }
    case 'turnTaking': return pred.turnTakingEvent || '—';
    case 'emphasis': return pred.emphasizedWords?.join(', ') || '—';
    default: return '—';
  }
}
