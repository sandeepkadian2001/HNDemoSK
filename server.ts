import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';

interface HackerNewsRawItem {
  id: number;
  deleted?: boolean;
  type?: string;
  by?: string;
  time: number;
  text?: string;
  dead?: boolean;
  parent?: number;
  kids?: number[];
  url?: string;
  score?: number;
  title?: string;
  descendants?: number;
}

interface StoryDto {
  title: string;
  uri: string;
  postedBy: string;
  time: string;
  score: number;
  commentCount: number;
}

interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

class HackerNewsBackendService {
  private itemCache = new Map<number, CacheItem<StoryDto | null>>();
  private bestIdsCache: CacheItem<number[]> | null = null;
  private inFlightItemTasks = new Map<number, Promise<StoryDto | null>>();
  private activeConcurrency = 0;
  private maxConcurrency = 20;
  private concurrencyQueue: Array<() => void> = [];

  // Metrics
  public metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    upstreamCallsMade: 0,
    upstreamCallsPrevented: 0,
    lastBackgroundRefresh: new Date().toISOString(),
    totalResponseTimeMs: 0,
    requestCountForAvg: 0,
  };

  constructor() {
    // Start background refresher worker (every 60 seconds)
    this.warmUpCache();
    setInterval(() => {
      this.warmUpCache();
    }, 60_000);
  }

  private acquireConcurrency(): Promise<void> {
    if (this.activeConcurrency < this.maxConcurrency) {
      this.activeConcurrency++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.concurrencyQueue.push(() => {
        this.activeConcurrency++;
        resolve();
      });
    });
  }

  private releaseConcurrency(): void {
    this.activeConcurrency--;
    if (this.concurrencyQueue.length > 0 && this.activeConcurrency < this.maxConcurrency) {
      const next = this.concurrencyQueue.shift();
      if (next) next();
    }
  }

  public clearCache(): void {
    this.itemCache.clear();
    this.bestIdsCache = null;
    this.inFlightItemTasks.clear();
  }

  public getCacheCount(): number {
    return this.itemCache.size;
  }

  public async warmUpCache(): Promise<void> {
    try {
      const ids = await this.fetchBestStoryIdsFromUpstream();
      if (ids && ids.length > 0) {
        this.bestIdsCache = {
          data: ids,
          expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes
        };
        this.metrics.lastBackgroundRefresh = new Date().toISOString();

        // Warm up top 50 items
        const warmUpIds = ids.slice(0, 50);
        await Promise.all(warmUpIds.map((id) => this.getStoryById(id)));
      }
    } catch (err) {
      console.error('[HackerNewsBackendService] Background warm-up failed:', err);
    }
  }

  private async fetchBestStoryIdsFromUpstream(): Promise<number[]> {
    this.metrics.upstreamCallsMade++;
    const response = await fetch('https://hacker-news.firebaseio.com/v0/beststories.json', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Hacker News beststories returned ${response.status}`);
    }
    const ids = (await response.json()) as number[];
    return ids || [];
  }

  public async getBestStoryIds(): Promise<number[]> {
    const now = Date.now();
    if (this.bestIdsCache && this.bestIdsCache.expiresAt > now) {
      return this.bestIdsCache.data;
    }
    const ids = await this.fetchBestStoryIdsFromUpstream();
    this.bestIdsCache = {
      data: ids,
      expiresAt: now + 2 * 60 * 1000,
    };
    return ids;
  }

  public async getStoryById(id: number): Promise<StoryDto | null> {
    const now = Date.now();
    const cached = this.itemCache.get(id);
    if (cached && cached.expiresAt > now) {
      this.metrics.upstreamCallsPrevented++;
      return cached.data;
    }

    // Single-Flight Request Coalescing
    if (this.inFlightItemTasks.has(id)) {
      this.metrics.upstreamCallsPrevented++;
      return this.inFlightItemTasks.get(id)!;
    }

    const task = (async () => {
      await this.acquireConcurrency();
      try {
        // Double check cache after waiting for concurrency slot
        const recheck = this.itemCache.get(id);
        if (recheck && recheck.expiresAt > Date.now()) {
          this.metrics.upstreamCallsPrevented++;
          return recheck.data;
        }

        this.metrics.upstreamCallsMade++;
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          return null;
        }

        const raw = (await res.json()) as HackerNewsRawItem | null;
        if (!raw || raw.deleted || raw.dead || raw.type !== 'story') {
          this.itemCache.set(id, { data: null, expiresAt: Date.now() + 5 * 60 * 1000 });
          return null;
        }

        const dto = this.mapToDto(raw);
        this.itemCache.set(id, {
          data: dto,
          expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes cache
        });
        return dto;
      } catch (error) {
        console.warn(`[HackerNewsBackendService] Error fetching item ${id}:`, error);
        return null;
      } finally {
        this.releaseConcurrency();
        this.inFlightItemTasks.delete(id);
      }
    })();

    this.inFlightItemTasks.set(id, task);
    return task;
  }

  private mapToDto(raw: HackerNewsRawItem): StoryDto {
    const d = new Date(raw.time * 1000);
    // Explicit ISO 8601 UTC format: YYYY-MM-DDTHH:mm:ss+00:00
    const timeFormatted = d.toISOString().replace('.000Z', '+00:00').replace('Z', '+00:00');

    const uri = raw.url && raw.url.trim().length > 0
      ? raw.url
      : `https://news.ycombinator.com/item?id=${raw.id}`;

    return {
      title: raw.title || 'Untitled Story',
      uri,
      postedBy: raw.by || 'anonymous',
      time: timeFormatted,
      score: raw.score ?? 0,
      commentCount: raw.descendants ?? 0,
    };
  }

  public async getBestStories(n: number): Promise<{ stories: StoryDto[]; fromCache: boolean; upstreamCalls: number }> {
    const startCalls = this.metrics.upstreamCallsMade;
    const ids = await this.getBestStoryIds();
    const candidateIds = ids.slice(0, Math.max(n, Math.min(ids.length, n + 25)));

    const storyResults = await Promise.all(candidateIds.map((id) => this.getStoryById(id)));
    const validStories = storyResults.filter((s): s is StoryDto => s !== null);

    // Sort strictly descending by score
    validStories.sort((a, b) => b.score - a.score);
    const topStories = validStories.slice(0, n);

    const callsDiff = this.metrics.upstreamCallsMade - startCalls;
    const fromCache = callsDiff === 0;

    return {
      stories: topStories,
      fromCache,
      upstreamCalls: callsDiff,
    };
  }
}

const hnService = new HackerNewsBackendService();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // CORS support
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'Healthy',
      service: 'HackerNewsBestStoriesApi',
      timestamp: new Date().toISOString(),
    });
  });

  // RESTful Endpoint: GET /api/stories/best and alias /api/beststories
  const handleBestStories = async (req: Request, res: Response) => {
    const startTime = performance.now();
    hnService.metrics.totalRequests++;

    const nParam = req.query.n !== undefined ? req.query.n.toString() : '10';
    const n = parseInt(nParam, 10);

    if (isNaN(n) || n <= 0) {
      res.status(400).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
        title: 'Invalid request parameter',
        status: 400,
        detail: "The query parameter 'n' must be a positive integer greater than 0.",
        instance: req.originalUrl,
      });
      return;
    }

    if (n > 200) {
      res.status(400).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
        title: 'Parameter exceeds maximum allowable value',
        status: 400,
        detail: "The query parameter 'n' cannot exceed 200.",
        instance: req.originalUrl,
      });
      return;
    }

    try {
      const { stories, fromCache, upstreamCalls } = await hnService.getBestStories(n);
      const elapsed = Math.round(performance.now() - startTime);

      hnService.metrics.totalResponseTimeMs += elapsed;
      hnService.metrics.requestCountForAvg++;
      if (fromCache) {
        hnService.metrics.cacheHits++;
      } else {
        hnService.metrics.cacheMisses++;
      }

      res.setHeader('X-Cache-Status', fromCache ? 'HIT' : 'MISS');
      res.setHeader('X-Upstream-Calls', upstreamCalls.toString());
      res.setHeader('X-Response-Time-Ms', elapsed.toString());

      // Return exact array matching specification contract
      res.json(stories);
    } catch (error) {
      console.error('[API Error] /api/stories/best:', error);
      res.status(500).json({
        type: 'https://tools.ietf.org/html/rfc7231#section-6.6.1',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An error occurred while retrieving stories from Hacker News.',
      });
    }
  };

  app.get('/api/stories/best', handleBestStories);
  app.get('/api/beststories', handleBestStories);

  // Performance & Overload Metrics
  app.get('/api/metrics', (_req: Request, res: Response) => {
    const avgResponseTime =
      hnService.metrics.requestCountForAvg > 0
        ? Math.round(hnService.metrics.totalResponseTimeMs / hnService.metrics.requestCountForAvg)
        : 0;

    res.json({
      ...hnService.metrics,
      avgResponseTimeMs: avgResponseTime,
      cachedStoriesCount: hnService.getCacheCount(),
      systemStatus: 'Operational',
      upstreamTarget: 'https://hacker-news.firebaseio.com/v0/',
    });
  });

  // Cache reset endpoint
  app.post('/api/cache/clear', (_req: Request, res: Response) => {
    hnService.clearCache();
    res.json({ message: 'Memory cache successfully purged', clearedAt: new Date().toISOString() });
  });

  // Repository files endpoint for browser UI
  app.get('/api/repository/files', (_req: Request, res: Response) => {
    const repoBase = path.resolve(process.cwd(), 'HackerNewsBestStoriesApi');
    const resultFiles: Array<{ path: string; name: string; content: string; language: string; size: number }> = [];

    function walkDir(dir: string, relPrefix = '') {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relPrefix, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'bin' && entry.name !== 'obj' && entry.name !== '.vs') {
            walkDir(fullPath, relPath);
          }
        } else {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            let language = 'plaintext';
            if (entry.name.endsWith('.cs')) language = 'csharp';
            else if (entry.name.endsWith('.json')) language = 'json';
            else if (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln')) language = 'xml';
            else if (entry.name.endsWith('.md')) language = 'markdown';
            else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) language = 'yaml';
            else if (entry.name === 'Dockerfile') language = 'dockerfile';

            resultFiles.push({
              path: relPath,
              name: entry.name,
              content,
              language,
              size: Buffer.byteLength(content, 'utf8'),
            });
          } catch {
            // Ignore unreadable binary files
          }
        }
      }
    }

    walkDir(repoBase);
    res.json({ files: resultFiles });
  });

  // Download entire repository as ZIP
  app.get('/api/repository/download', async (_req: Request, res: Response) => {
    try {
      const zip = new JSZip();
      const repoBase = path.resolve(process.cwd(), 'HackerNewsBestStoriesApi');

      function addDirToZip(dir: string, zipFolder: JSZip) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'bin' && entry.name !== 'obj' && entry.name !== '.vs') {
              const subFolder = zipFolder.folder(entry.name);
              if (subFolder) addDirToZip(fullPath, subFolder);
            }
          } else {
            const content = fs.readFileSync(fullPath);
            zipFolder.file(entry.name, content);
          }
        }
      }

      addDirToZip(repoBase, zip);

      // Also ensure root README is included if exists
      if (fs.existsSync(path.resolve(process.cwd(), 'README.md'))) {
        zip.file('README.md', fs.readFileSync(path.resolve(process.cwd(), 'README.md')));
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="HackerNewsBestStoriesApi.zip"');
      res.send(zipBuffer);
    } catch (err) {
      console.error('[Download ZIP Error]', err);
      res.status(500).json({ error: 'Failed to generate repository archive' });
    }
  });

  // Mount Vite development server middleware
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
