import React, { useState } from 'react';
import { Copy, Check, Terminal, BookOpen, Layers } from 'lucide-react';

export const ApiDocumentation: React.FC = () => {
  const [snippetLang, setSnippetLang] = useState<'curl' | 'csharp' | 'typescript' | 'python'>('curl');
  const [copied, setCopied] = useState(false);

  const snippets: Record<string, string> = {
    curl: `curl -X GET "http://localhost:5000/api/stories/best?n=10" \\
     -H "Accept: application/json"`,
    csharp: `using System.Net.Http.Json;

using var client = new HttpClient { BaseAddress = new Uri("http://localhost:5000/") };
var stories = await client.GetFromJsonAsync<List<StoryDto>>("api/stories/best?n=10");

foreach (var story in stories ?? [])
{
    Console.WriteLine($"[{story.Score}] {story.Title} ({story.Uri})");
}

public record StoryDto(
    string Title,
    string Uri,
    string PostedBy,
    string Time,
    int Score,
    int CommentCount
);`,
    typescript: `// TypeScript / Fetch Example
interface Story {
  title: string;
  uri: string;
  postedBy: string;
  time: string;
  score: number;
  commentCount: number;
}

const response = await fetch('/api/stories/best?n=10');
const stories: Story[] = await response.json();

console.log(\`Retrieved \${stories.length} best stories:\`);
stories.forEach(s => console.log(\`[\${s.score}] \${s.title}\`));`,
    python: `import requests

response = requests.get('http://localhost:5000/api/stories/best', params={'n': 10})
stories = response.json()

for story in stories:
    print(f"[{story['score']}] {story['title']} - {story['uri']}")`
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippets[snippetLang]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-bold text-slate-100">
            RESTful API Specification
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          The API retrieves the details of the best <code className="text-orange-400">n</code> stories from the Hacker News Firebase API, ranked in descending order of their upvote score. Individual story items are fetched concurrently with bounded throttling and cached to prevent overloading Hacker News.
        </p>

        {/* Endpoints Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Method</th>
                <th className="py-2.5 px-3">Endpoint Route</th>
                <th className="py-2.5 px-3">Parameters</th>
                <th className="py-2.5 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
              <tr className="hover:bg-slate-800/40">
                <td className="py-2.5 px-3">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold text-[10px]">
                    GET
                  </span>
                </td>
                <td className="py-2.5 px-3 text-orange-400 font-semibold">
                  /api/stories/best
                </td>
                <td className="py-2.5 px-3">
                  <code>n</code> (optional, int, default: 10, range: 1–200)
                </td>
                <td className="py-2.5 px-3 font-sans text-slate-300">
                  Primary endpoint returning best stories sorted by score descending.
                </td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="py-2.5 px-3">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold text-[10px]">
                    GET
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-300">
                  /api/beststories
                </td>
                <td className="py-2.5 px-3">
                  <code>n</code> (optional, int, default: 10)
                </td>
                <td className="py-2.5 px-3 font-sans text-slate-300">
                  Convenience alias endpoint matching alternate URL scheme.
                </td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="py-2.5 px-3">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold text-[10px]">
                    GET
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-300">
                  /health
                </td>
                <td className="py-2.5 px-3 text-slate-500">—</td>
                <td className="py-2.5 px-3 font-sans text-slate-300">
                  Liveness and readiness health check probe.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Snippets Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            {(['curl', 'csharp', 'typescript', 'python'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setSnippetLang(lang)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                  snippetLang === lang
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'csharp' ? 'C# (.NET)' : lang}
              </button>
            ))}
          </div>

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
        </div>

        <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed">
          <code>{snippets[snippetLang]}</code>
        </pre>
      </div>

      {/* Error Handling Contract */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-bold text-slate-100">
            HTTP Status Codes & Error Handling
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
            <span className="font-mono font-bold text-emerald-400">200 OK</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Returns JSON array of stories sorted strictly in descending order of score.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
            <span className="font-mono font-bold text-amber-400">400 Bad Request</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Returned if <code>n &le; 0</code> or <code>n &gt; 200</code>. Response body uses RFC 7807 <code>ProblemDetails</code>.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
            <span className="font-mono font-bold text-red-400">429 Too Many Requests</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Returned if incoming request bursts exceed rate limiting permit windows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
