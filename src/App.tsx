/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import SunLiyaApp from './SunLiyaApp';
import EvaluatorApp from './EvaluatorApp';
import { Activity, FlaskConical } from 'lucide-react';

type ActiveApp = 'sunliya' | 'evaluator';

export default function App() {
  const [active, setActive] = useState<ActiveApp>('sunliya');

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top nav bar */}
      <div
        className="flex items-center justify-end px-4 py-2 border-b shrink-0"
        style={{
          background: active === 'sunliya' ? '#ffffff' : '#0a0a0f',
          borderColor: active === 'sunliya' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
        }}
      >
        <div
          className="flex rounded-full p-0.5 gap-0.5"
          style={{
            background: active === 'sunliya' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)',
            border: active === 'sunliya' ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <NavBtn
            active={active === 'sunliya'}
            darkMode={false}
            onClick={() => setActive('sunliya')}
            icon={<Activity size={12} />}
            label="SunLiya.AI"
          />
          <NavBtn
            active={active === 'evaluator'}
            darkMode={active === 'sunliya'}
            onClick={() => setActive('evaluator')}
            icon={<FlaskConical size={12} />}
            label="Evaluator"
          />
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1">
        {active === 'sunliya' ? <SunLiyaApp /> : <EvaluatorApp />}
      </div>
    </div>
  );
}

function NavBtn({
  active,
  darkMode,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  darkMode: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
      style={{
        background: active ? 'rgba(99,102,241,0.9)' : 'transparent',
        color: active ? 'white' : darkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.45)',
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
