import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ApiConsole } from './components/ApiConsole';
import { StoryCardList } from './components/StoryCardList';
import { JsonViewer } from './components/JsonViewer';
import { BenchmarkPanel } from './components/BenchmarkPanel';
import { RepositoryViewer } from './components/RepositoryViewer';
import { ApiDocumentation } from './components/ApiDocumentation';
import { StoryDto, ApiMetrics } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'benchmark' | 'repository' | 'docs'>('explorer');
  const [n, setN] = useState<number>(10);
  const [stories, setStories] = useState<StoryDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [cacheStatus, setCacheStatus] = useState<'HIT' | 'MISS' | null>(null);
  const [upstreamCalls, setUpstreamCalls] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'json'>('cards');
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);

  // Fetch API metrics
  const refreshMetrics = useCallback(() => {
    fetch('/api/metrics')
      .then((res) => res.json())
      .then((data: ApiMetrics) => setMetrics(data))
      .catch((err) => console.error('Error fetching metrics:', err));
  }, []);

  // Execute stories request
  const executeRequest = useCallback(async () => {
    setIsLoading(true);
    const start = performance.now();
    try {
      const response = await fetch(`/api/stories/best?n=${n}`);
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      const cacheHeader = response.headers.get('X-Cache-Status');
      setCacheStatus(cacheHeader === 'HIT' ? 'HIT' : 'MISS');

      const callsHeader = response.headers.get('X-Upstream-Calls');
      setUpstreamCalls(callsHeader ? parseInt(callsHeader, 10) : 0);

      if (response.ok) {
        const data: StoryDto[] = await response.json();
        setStories(data);
      } else {
        console.error('API Error:', await response.text());
      }
    } catch (err) {
      console.error('Request failed:', err);
    } finally {
      setIsLoading(false);
      refreshMetrics();
    }
  }, [n, refreshMetrics]);

  // Initial load
  useEffect(() => {
    executeRequest();
    refreshMetrics();
    const interval = setInterval(refreshMetrics, 10000);
    return () => clearInterval(interval);
  }, [executeRequest, refreshMetrics]);

  // Clear cache action
  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      await fetch('/api/cache/clear', { method: 'POST' });
      await executeRequest();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    } finally {
      setIsClearingCache(false);
    }
  };

  // Download complete solution zip
  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      const res = await fetch('/api/repository/download');
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'HackerNewsBestStoriesApi.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading repository ZIP:', err);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-orange-500/30 selection:text-orange-200">
      {/* 3-Zone Header Contract */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onDownloadZip={handleDownloadZip}
        isDownloadingZip={isDownloadingZip}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Tab 1: Live API Explorer */}
        {activeTab === 'explorer' && (
          <div className="space-y-6">
            <ApiConsole
              n={n}
              setN={setN}
              isLoading={isLoading}
              onExecute={executeRequest}
              latencyMs={latencyMs}
              cacheStatus={cacheStatus}
              upstreamCalls={upstreamCalls}
              storyCount={stories.length}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onClearCache={handleClearCache}
              isClearingCache={isClearingCache}
            />

            {viewMode === 'cards' ? (
              <StoryCardList stories={stories} isLoading={isLoading} />
            ) : (
              <JsonViewer data={stories} />
            )}
          </div>
        )}

        {/* Tab 2: Overload Protection & High-Load Benchmark */}
        {activeTab === 'benchmark' && (
          <BenchmarkPanel
            metrics={metrics}
            onRefreshMetrics={refreshMetrics}
            onClearCache={handleClearCache}
          />
        )}

        {/* Tab 3: Complete ASP.NET Core Solution Codebase */}
        {activeTab === 'repository' && (
          <RepositoryViewer
            onDownloadZip={handleDownloadZip}
            isDownloadingZip={isDownloadingZip}
          />
        )}

        {/* Tab 4: API Specification & OpenAPI Docs */}
        {activeTab === 'docs' && <ApiDocumentation />}
      </main>

      {/* Footer with clean unboxed links */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>Hacker News Best Stories API</span>
            <span aria-hidden="true">·</span>
            <span>ASP.NET Core 8 & C#</span>
            <span aria-hidden="true">·</span>
            <span>Overload Protection Enabled</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/HackerNews/API"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              Hacker News Firebase API Docs
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://hacker-news.firebaseio.com/v0/beststories.json"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              beststories.json
            </a>
            <span aria-hidden="true">·</span>
            <button
              onClick={handleDownloadZip}
              className="hover:text-orange-400 transition-colors"
            >
              Export Repository (.zip)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
