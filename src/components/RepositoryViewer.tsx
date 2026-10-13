import React, { useState, useEffect } from 'react';
import { Folder, FileCode, Copy, Check, Download, ExternalLink, Terminal, FileText } from 'lucide-react';
import { RepoFile } from '../types';

interface RepositoryViewerProps {
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
}

export const RepositoryViewer: React.FC<RepositoryViewerProps> = ({
  onDownloadZip,
  isDownloadingZip,
}) => {
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<RepoFile | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/repository/files')
      .then((res) => res.json())
      .then((data) => {
        if (data.files && data.files.length > 0) {
          setFiles(data.files);
          // Default to StoriesController.cs or README.md
          const defaultFile =
            data.files.find((f: RepoFile) => f.name === 'StoriesController.cs') ||
            data.files.find((f: RepoFile) => f.name === 'README.md') ||
            data.files[0];
          setSelectedFile(defaultFile);
        }
      })
      .catch((err) => console.error('Error loading repository files:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!selectedFile) return;
    try {
      await navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy file:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-100">
              ASP.NET Core 8 Solution Codebase
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-blue-950 text-blue-400 rounded border border-blue-800/60">
              Clean Architecture
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Production C# Web API project, background cache refresher worker, Polly resilience, xUnit test suite, and Docker container.
          </p>
        </div>

        <button
          onClick={onDownloadZip}
          disabled={isDownloadingZip}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors shadow-sm disabled:opacity-50 shrink-0 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloadingZip ? 'Packaging Zip...' : 'Download Complete Repo (.zip)'}</span>
        </button>
      </div>

      {/* Main File Explorer & Viewer Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Tree Column */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-orange-400" />
              <span>Solution Files ({files.length})</span>
            </div>
          </div>

          <div className="p-2 space-y-1 max-h-[620px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-xs text-slate-500 text-center animate-pulse">
                Loading files...
              </div>
            ) : (
              files.map((file) => {
                const isSelected = selectedFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono rounded-lg transition-colors text-left truncate ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {file.name.endsWith('.md') ? (
                      <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    )}
                    <span className="truncate">{file.path}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Code Content Column */}
        <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {selectedFile ? (
            <div>
              {/* Code toolbar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 font-mono text-slate-300">
                  <span className="font-semibold text-slate-100">{selectedFile.path}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400 tabular-nums">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Code block */}
              <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed max-h-[620px] select-text">
                <code>{selectedFile.content}</code>
              </pre>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-slate-500">
              Select a file from the repository tree to view code.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
