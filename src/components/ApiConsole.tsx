import React from 'react';
import { Play, RotateCcw, Clock, Zap, Database, ArrowUpDown, Code, LayoutList } from 'lucide-react';

interface ApiConsoleProps {
  n: number;
  setN: (val: number) => void;
  isLoading: boolean;
  onExecute: () => void;
  latencyMs: number | null;
  cacheStatus: 'HIT' | 'MISS' | null;
  upstreamCalls: number | null;
  storyCount: number;
  viewMode: 'cards' | 'json';
  setViewMode: (mode: 'cards' | 'json') => void;
  onClearCache: () => void;
  isClearingCache: boolean;
}

export const ApiConsole: React.FC<ApiConsoleProps> = ({
  n,
  setN,
  isLoading,
  onExecute,
  latencyMs,
  cacheStatus,
  upstreamCalls,
  storyCount,
  viewMode,
  setViewMode,
  onClearCache,
  isClearingCache,
}) => {
  const presets = [5, 10, 20, 50, 100];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Top request URL bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0 bg-slate-950 px-3.5 py-2.5 rounded-lg border border-slate-800 font-mono text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold border border-emerald-800/60">
            GET
          </span>
          <span className="text-slate-400">/api/stories/best?n=</span>
          <span className="text-orange-400 font-semibold">{n}</span>
          <span className="text-slate-600 hidden sm:inline ml-auto text-[11px]">
            Hacker News REST endpoint
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onExecute}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap"
          >
            <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : 'fill-current'}`} />
            <span>{isLoading ? 'Executing Request...' : 'Send Request'}</span>
          </button>

          <button
            onClick={onClearCache}
            disabled={isClearingCache}
            title="Purge in-memory cache to test cold-start latency"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700/60 whitespace-nowrap"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isClearingCache ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Purge Cache</span>
          </button>
        </div>
      </div>

      {/* Parameter Controls & Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-3">
          <label htmlFor="n-input" className="text-xs font-medium text-slate-300 whitespace-nowrap">
            Stories Count (<code className="text-orange-400">n</code>):
          </label>
          <input
            id="n-input"
            type="number"
            min={1}
            max={200}
            value={n}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) setN(Math.min(200, Math.max(1, val)));
            }}
            className="w-16 px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
          />

          <div className="flex items-center gap-1">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => setN(preset)}
                className={`px-2 py-0.5 text-xs font-mono rounded transition-colors ${
                  n === preset
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 shrink-0">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'cards'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>Story Feed</span>
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'json'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Raw JSON Contract</span>
          </button>
        </div>
      </div>

      {/* Response Telemetry Banner */}
      {latencyMs !== null && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-300 font-semibold">200 OK</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono tabular-nums">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Latency:</span>
            <span className="text-slate-200 font-semibold">{latencyMs} ms</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono">
            <Zap className="w-3.5 h-3.5 text-slate-500" />
            <span>Cache:</span>
            <span
              className={`font-bold ${
                cacheStatus === 'HIT' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {cacheStatus}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono tabular-nums">
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span>Upstream Requests:</span>
            <span className="text-slate-200 font-semibold">{upstreamCalls ?? 0}</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono tabular-nums ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span>Sorted Stories Returned:</span>
            <span className="text-orange-400 font-semibold">{storyCount}</span>
          </div>
        </div>
      )}
    </div>
  );
};
