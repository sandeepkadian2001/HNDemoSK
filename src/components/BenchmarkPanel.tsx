import React, { useState } from 'react';
import { ShieldCheck, Zap, Activity, Cpu, RotateCcw, AlertTriangle, ArrowRight, Play } from 'lucide-react';
import { ApiMetrics } from '../types';

interface BenchmarkPanelProps {
  metrics: ApiMetrics | null;
  onRefreshMetrics: () => void;
  onClearCache: () => void;
}

interface BurstResult {
  concurrency: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  successCount: number;
  failCount: number;
  cacheHits: number;
  upstreamCallsDiff: number;
}

export const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({
  metrics,
  onRefreshMetrics,
  onClearCache,
}) => {
  const [burstSize, setBurstSize] = useState<number>(25);
  const [isRunningBurst, setIsRunningBurst] = useState<boolean>(false);
  const [burstResult, setBurstResult] = useState<BurstResult | null>(null);

  const runConcurrentLoadTest = async () => {
    setIsRunningBurst(true);
    setBurstResult(null);

    const initialCalls = metrics?.upstreamCallsMade ?? 0;
    const startWallClock = performance.now();
    const latencies: number[] = [];
    let hits = 0;
    let successes = 0;
    let fails = 0;

    const requests = Array.from({ length: burstSize }, async () => {
      const singleStart = performance.now();
      try {
        const res = await fetch('/api/stories/best?n=10');
        const elapsed = Math.round(performance.now() - singleStart);
        latencies.push(elapsed);
        if (res.ok) {
          successes++;
          const cacheHeader = res.headers.get('X-Cache-Status');
          if (cacheHeader === 'HIT') hits++;
        } else {
          fails++;
        }
      } catch {
        fails++;
        latencies.push(Math.round(performance.now() - singleStart));
      }
    });

    await Promise.all(requests);
    const totalWallClock = Math.round(performance.now() - startWallClock);

    onRefreshMetrics();

    setBurstResult({
      concurrency: burstSize,
      totalTimeMs: totalWallClock,
      avgTimeMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      minTimeMs: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxTimeMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      successCount: successes,
      failCount: fails,
      cacheHits: hits,
      upstreamCallsDiff: 0,
    });

    setIsRunningBurst(false);
  };

  const hitRatePercent = metrics && metrics.totalRequests > 0
    ? Math.round((metrics.cacheHits / metrics.totalRequests) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Cache Hit Ratio</span>
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {hitRatePercent}%
          </div>
          <p className="text-[11px] text-slate-500">
            {metrics?.cacheHits ?? 0} hits / {metrics?.totalRequests ?? 0} total requests
          </p>
        </div>

        {/* Metric 2 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Upstream Overload Protection</span>
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            {metrics?.upstreamCallsPrevented.toLocaleString() ?? 0}
          </div>
          <p className="text-[11px] text-slate-500">
            Hacker News calls prevented by cache & coalescing
          </p>
        </div>

        {/* Metric 3 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Mean Response Time</span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {metrics?.avgResponseTimeMs ?? 0} ms
          </div>
          <p className="text-[11px] text-slate-500">
            Sub-millisecond latency when served from RAM
          </p>
        </div>

        {/* Metric 4 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Warm Cache Items</span>
            <Cpu className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-orange-400 tabular-nums">
            {metrics?.cachedStoriesCount ?? 0}
          </div>
          <p className="text-[11px] text-slate-500">
            Stories stored in memory with sliding TTL
          </p>
        </div>
      </div>

      {/* Concurrent Burst Testing Sandbox */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              High-Concurrency Traffic Burst Simulator
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fires simultaneous parallel HTTP calls to demonstrate the API's caching and zero-overload protection.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Burst Size:</span>
            {[10, 25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => setBurstSize(size)}
                disabled={isRunningBurst}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  burstSize === size
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {size}
              </button>
            ))}

            <button
              onClick={runConcurrentLoadTest}
              disabled={isRunningBurst}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 ml-2"
            >
              <Play className={`w-3.5 h-3.5 ${isRunningBurst ? 'animate-spin' : ''}`} />
              <span>{isRunningBurst ? 'Firing Burst...' : `Simulate ${burstSize} Requests`}</span>
            </button>
          </div>
        </div>

        {/* Burst Results */}
        {burstResult && (
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400">
                Burst Test Completed ({burstResult.concurrency} concurrent requests)
              </span>
              <span className="text-slate-400 font-mono tabular-nums">
                Total Wall-Clock Time: {burstResult.totalTimeMs} ms
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px]">Successful Responses</span>
                <span className="text-sm font-mono font-bold text-slate-200 tabular-nums">
                  {burstResult.successCount} / {burstResult.concurrency}
                </span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px]">Average Latency</span>
                <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
                  {burstResult.avgTimeMs} ms
                </span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px]">Min / Max Latency</span>
                <span className="text-sm font-mono font-bold text-slate-200 tabular-nums">
                  {burstResult.minTimeMs} ms / {burstResult.maxTimeMs} ms
                </span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px]">Cache Hits</span>
                <span className="text-sm font-mono font-bold text-blue-400 tabular-nums">
                  {burstResult.cacheHits} / {burstResult.concurrency}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Architecture Defense Breakdown */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <h4 className="text-xs font-semibold text-slate-300">
            How This System Prevents Upstream Overload
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <div className="font-semibold text-slate-200">1. Background Pre-Warming</div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Periodic hosted worker polls <code>/beststories.json</code> every 60s, keeping best story IDs and payloads hot in memory so callers never block on upstream I/O.
              </p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <div className="font-semibold text-slate-200">2. Semaphore Throttling</div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Strict <code>SemaphoreSlim(20)</code> limits maximum simultaneous outbound requests to Firebase, preventing socket starvation and upstream rate-limits.
              </p>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1">
              <div className="font-semibold text-slate-200">3. SingleFlight Coalescing</div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Concurrent requests for uncached items hook into the same in-flight task via thread-safe task dictionaries, issuing exactly 1 HTTP call instead of N.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
