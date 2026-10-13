import React from 'react';
import { ExternalLink, MessageSquare, ThumbsUp, User, Calendar } from 'lucide-react';
import { StoryDto } from '../types';

interface StoryCardListProps {
  stories: StoryDto[];
  isLoading: boolean;
}

export const StoryCardList: React.FC<StoryCardListProps> = ({ stories, isLoading }) => {
  if (isLoading && stories.length === 0) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl animate-pulse space-y-2.5"
          >
            <div className="h-4 bg-slate-800 rounded w-3/4" />
            <div className="h-3 bg-slate-800/60 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
        <p className="text-sm text-slate-400">No stories retrieved yet.</p>
        <p className="text-xs text-slate-500 mt-1">
          Click "Send Request" to fetch the best stories from Hacker News.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stories.map((story, index) => {
        // Extract domain from uri
        let domain = '';
        try {
          const parsed = new URL(story.uri);
          domain = parsed.hostname.replace('www.', '');
        } catch {
          domain = story.uri;
        }

        return (
          <article
            key={`${story.uri}-${index}`}
            className="group p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-colors shadow-sm"
          >
            <div className="flex items-start gap-3.5">
              {/* Rank Index */}
              <div className="text-xs font-mono font-semibold text-slate-500 pt-0.5 w-6 shrink-0 tabular-nums">
                #{index + 1}
              </div>

              {/* Main Content */}
              <div className="flex-1 min-w-0">
                {/* Title and external link */}
                <h3 className="text-sm font-semibold text-slate-100 group-hover:text-orange-400 transition-colors leading-snug">
                  <a
                    href={story.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <span>{story.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-orange-400 shrink-0" />
                  </a>
                </h3>

                {/* Unboxed Metadata with Typographic Separators (Zero-Pill Compliance) */}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
                  {/* Score */}
                  <span className="inline-flex items-center gap-1 text-orange-400 font-semibold font-mono tabular-nums">
                    <ThumbsUp className="w-3 h-3" />
                    <span>{story.score.toLocaleString()} points</span>
                  </span>

                  <span aria-hidden="true" className="text-slate-600">·</span>

                  {/* Comments */}
                  <span className="inline-flex items-center gap-1 text-slate-300 font-mono tabular-nums">
                    <MessageSquare className="w-3 h-3 text-slate-500" />
                    <span>{story.commentCount.toLocaleString()} comments</span>
                  </span>

                  <span aria-hidden="true" className="text-slate-600">·</span>

                  {/* Posted By */}
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <User className="w-3 h-3 text-slate-500" />
                    <span>by {story.postedBy}</span>
                  </span>

                  <span aria-hidden="true" className="text-slate-600">·</span>

                  {/* Time ISO 8601 */}
                  <span className="inline-flex items-center gap-1 text-slate-500 font-mono tabular-nums" title={`Full ISO: ${story.time}`}>
                    <Calendar className="w-3 h-3 text-slate-600" />
                    <span>{story.time}</span>
                  </span>

                  {domain && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-500 truncate max-w-[200px]">
                        ({domain})
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};
