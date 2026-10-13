import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

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

  public async warmUpCache(): Promise<void> {
    try {
      const ids = await this.fetchBestStoryIdsFromUpstream();
      if (ids && ids.length > 0) {
        this.bestIdsCache = {
          data: ids,
          expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes
        };

        // Warm up top 50 items
        const warmUpIds = ids.slice(0, 50);
        await Promise.all(warmUpIds.map((id) => this.getStoryById(id)));
      }
    } catch (err) {
      console.error('[HackerNewsBackendService] Background warm-up failed:', err);
    }
  }

  private async fetchBestStoryIdsFromUpstream(): Promise<number[]> {
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
      return cached.data;
    }

    // Single-Flight Request Coalescing
    if (this.inFlightItemTasks.has(id)) {
      return this.inFlightItemTasks.get(id)!;
    }

    const task = (async () => {
      await this.acquireConcurrency();
      try {
        const recheck = this.itemCache.get(id);
        if (recheck && recheck.expiresAt > Date.now()) {
          return recheck.data;
        }

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

  public async getBestStories(n: number): Promise<{ stories: StoryDto[]; fromCache: boolean }> {
    const ids = await this.getBestStoryIds();
    const candidateIds = ids.slice(0, Math.max(n, Math.min(ids.length, n + 25)));

    const storyResults = await Promise.all(candidateIds.map((id) => this.getStoryById(id)));
    const validStories = storyResults.filter((s): s is StoryDto => s !== null);

    // Sort strictly descending by score
    validStories.sort((a, b) => b.score - a.score);
    const topStories = validStories.slice(0, n);

    return {
      stories: topStories,
      fromCache: true,
    };
  }
}

const hnService = new HackerNewsBackendService();

// OpenAPI 3.0.1 Specification matching Swashbuckle
const swaggerSpec = {
  openapi: '3.0.1',
  info: {
    title: 'Hacker News Best Stories API',
    version: 'v1',
    description: 'ASP.NET Core 10 RESTful Web Service to retrieve the details of the best n stories from the Hacker News API, ranked by score descending.',
    contact: {
      name: 'API Engineering Team',
    },
  },
  paths: {
    '/api/stories/best': {
      get: {
        tags: ['Stories'],
        summary: 'Retrieves the details of the best n stories from Hacker News, ranked by score descending.',
        operationId: 'GetBestStories',
        parameters: [
          {
            name: 'n',
            in: 'query',
            description: 'The number of best stories to retrieve (must be between 1 and 200).',
            required: false,
            schema: {
              type: 'integer',
              format: 'int32',
              default: 10,
              minimum: 1,
              maximum: 200,
            },
          },
        ],
        responses: {
          '200': {
            description: 'Returns the array of best stories sorted by score descending.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/StoryDto',
                  },
                },
              },
            },
          },
          '400': {
            description: 'If the parameter n is less than 1 or exceeds maximum limit.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ProblemDetails',
                },
              },
            },
          },
          '500': {
            description: 'If an unhandled server error occurs.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ProblemDetails',
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check probe endpoint.',
        operationId: 'HealthCheck',
        responses: {
          '200': {
            description: 'Service is healthy and ready to accept traffic.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'Healthy' },
                    service: { type: 'string', example: 'HackerNewsBestStoriesApi' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      StoryDto: {
        type: 'object',
        required: ['title', 'uri', 'postedBy', 'time', 'score', 'commentCount'],
        properties: {
          title: {
            type: 'string',
            description: 'The title of the story.',
            example: 'A uBlock Origin update was rejected from the Chrome Web Store',
          },
          uri: {
            type: 'string',
            description: 'The URL of the story or discussion.',
            example: 'https://github.com/uBlockOrigin/uBlock-issues/issues/745',
          },
          postedBy: {
            type: 'string',
            description: 'The username of the user who submitted the story.',
            example: 'ismaildonmez',
          },
          time: {
            type: 'string',
            description: 'The time the story was submitted in ISO 8601 format with UTC offset.',
            example: '2019-10-12T13:43:01+00:00',
          },
          score: {
            type: 'integer',
            format: 'int32',
            description: "The story's score (upvotes).",
            example: 1716,
          },
          commentCount: {
            type: 'integer',
            format: 'int32',
            description: 'The total number of comments on the story.',
            example: 572,
          },
        },
      },
      ProblemDetails: {
        type: 'object',
        properties: {
          type: { type: 'string', nullable: true },
          title: { type: 'string', nullable: true },
          status: { type: 'integer', format: 'int32', nullable: true },
          detail: { type: 'string', nullable: true },
          instance: { type: 'string', nullable: true },
        },
      },
    },
  },
};

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

  // OpenAPI Swagger specification endpoint
  app.get('/swagger/v1/swagger.json', (_req: Request, res: Response) => {
    res.json(swaggerSpec);
  });

  // Redirect /swagger to /
  app.get('/swagger', (_req: Request, res: Response) => {
    res.redirect('/');
  });

  // RESTful Endpoint: GET /api/stories/best and alias /api/beststories
  const handleBestStories = async (req: Request, res: Response) => {
    const startTime = performance.now();

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
      const { stories, fromCache } = await hnService.getBestStories(n);
      const elapsed = Math.round(performance.now() - startTime);

      res.setHeader('X-Cache-Status', fromCache ? 'HIT' : 'MISS');
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

  // 404 for unmapped API routes
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({
      type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
      title: 'Not Found',
      status: 404,
      detail: 'The requested API endpoint was not found.',
    });
  });

  // Mount Vite middleware for serving Swagger UI
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
