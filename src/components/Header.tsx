import React from 'react';
import { Download, Terminal } from 'lucide-react';

interface HeaderProps {
  activeTab: 'explorer' | 'benchmark' | 'repository' | 'docs';
  setActiveTab: (tab: 'explorer' | 'benchmark' | 'repository' | 'docs') => void;
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onDownloadZip,
  isDownloadingZip,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900 border-b border-slate-800 text-slate-100">
      {/* Zone 1: Wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-bold text-white shadow-sm">
          Y
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            Hacker News Best Stories
          </span>
          <span className="text-xs text-slate-400 font-mono hidden sm:inline">
            ASP.NET Core 10 (.NET 10)
          </span>
        </div>
      </div>

      {/* Zone 2: Nav Tabs */}
      <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-950/60 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'explorer'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Live API Explorer
        </button>
        <button
          onClick={() => setActiveTab('benchmark')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'benchmark'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Overload Protection & Load Test
        </button>
        <button
          onClick={() => setActiveTab('repository')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'repository'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          C# Solution Repository
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'docs'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          API Specification
        </button>
      </nav>

      {/* Zone 3: Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onDownloadZip}
          disabled={isDownloadingZip}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-500 active:bg-orange-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloadingZip ? 'Archiving...' : 'Download C# Repo (.zip)'}</span>
        </button>
      </div>
    </header>
  );
};
