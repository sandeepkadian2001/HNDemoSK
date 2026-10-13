export interface StoryDto {
  title: string;
  uri: string;
  postedBy: string;
  time: string;
  score: number;
  commentCount: number;
}

export interface ApiMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  upstreamCallsMade: number;
  upstreamCallsPrevented: number;
  lastBackgroundRefresh: string;
  avgResponseTimeMs: number;
  cachedStoriesCount: number;
  systemStatus: string;
  upstreamTarget: string;
}

export interface RepoFile {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
}
