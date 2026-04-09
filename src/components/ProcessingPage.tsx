/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { ProcessingStep } from '../types';

interface Props {
  steps: ProcessingStep[];
  currentTurn: number;
  totalTurns: number;
  modelName: string;
  etaSeconds: number | null;
  errors: string[];
}

const STEP_LABELS = [
  'Loading audio',
  'Segmenting turns from timestamps',
  'Running model on each segment',
  'Comparing predictions to ground truth',
  'Computing accuracy metrics',
];

function fmtEta(sec: number): string {
  if (sec < 60) return `~${Math.round(sec)}s remaining`;
  return `~${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s remaining`;
}

export default function ProcessingPage({
  steps, currentTurn, totalTurns, modelName, etaSeconds, errors
}: Props) {
  const progress = totalTurns > 0 ? (currentTurn / totalTurns) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#0a0a0f' }}>

      <div className="w-full max-w-lg space-y-8">
        {/* Title */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Evaluating annotations
          </h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Model: <span style={{ color: '#a5b4fc' }}>{modelName}</span>
          </p>
        </div>

        {/* Steps */}
        <div className="rounded-2xl border p-5 space-y-3"
          style={{ background: 'linear-gradient(145deg,#1a1a26,#13131c)', borderColor: 'rgba(255,255,255,0.07)' }}>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <StepIcon status={step.status} />
              <span className="text-sm" style={{
                color: step.status === 'active' ? 'rgba(255,255,255,0.9)'
                  : step.status === 'done' ? 'rgba(255,255,255,0.5)'
                    : step.status === 'error' ? '#fca5a5'
                      : 'rgba(255,255,255,0.3)',
              }}>
                Step {i + 1}: {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {totalTurns > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <span>Turn {Math.min(currentTurn + 1, totalTurns)} of {totalTurns}</span>
              {etaSeconds !== null && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {fmtEta(etaSeconds)}
                </span>
              )}
            </div>
            <div className="h-2 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                }}
              />
            </div>
            <div className="text-right text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {progress.toFixed(0)}% complete
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="rounded-xl border p-4 space-y-2"
            style={{ background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: '#fca5a5' }}>
              <AlertTriangle size={13} /> {errors.length} turn(s) failed — continuing with partial results
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {errors.slice(-5).map((e, i) => (
                <p key={i} className="text-xs font-mono" style={{ color: 'rgba(252,165,165,0.6)' }}>{e}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: ProcessingStep['status'] }) {
  if (status === 'done') return <CheckCircle2 size={16} color="#10b981" />;
  if (status === 'active') return <Loader2 size={16} color="#6366f1" className="animate-spin" />;
  if (status === 'error') return <AlertTriangle size={16} color="#f87171" />;
  return <div className="w-4 h-4 rounded-full border" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />;
}
