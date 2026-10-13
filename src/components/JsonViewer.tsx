import React, { useState } from 'react';
import { Copy, Check, Download, FileJson } from 'lucide-react';
import { StoryDto } from '../types';

interface JsonViewerProps {
  data: StoryDto[];
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hn-best-stories-${data.length}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lineCount = jsonString.split('\n').length;
  const byteSize = new Blob([jsonString]).size;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
          <FileJson className="w-4 h-4 text-orange-400" />
          <span>Response Body (application/json)</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400 font-mono tabular-nums">{lineCount} lines</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400 font-mono tabular-nums">{(byteSize / 1024).toFixed(1)} KB</span>
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
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Code body */}
      <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed max-h-[600px] select-text">
        <code>{jsonString}</code>
      </pre>
    </div>
  );
};
