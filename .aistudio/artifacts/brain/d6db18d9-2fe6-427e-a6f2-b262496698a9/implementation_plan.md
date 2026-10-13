# Hacker News Best Stories API (ASP.NET Core & Live Developer Workbench)

A production-grade ASP.NET Core 8 Web API solution engineered to retrieve and rank the best *n* stories from Hacker News efficiently under high load, accompanied by a live interactive API playground, benchmarking suite, and complete exportable repository with comprehensive documentation.

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural and design choices confirmed during clarification are locked into this plan. The solution delivers both the full C# ASP.NET Core solution repository and an active, live-running API in this environment so you can test endpoints, inspect payloads, and benchmark cache behavior immediately.

- **Confirmed Decision 1 (Caching & Concurrency)**: Dual-layer strategy combining a background scheduled worker (`HnBestStoriesBackgroundWorker`) that proactively refreshes best story IDs, in-memory caching (`IMemoryCache` with configurable TTL and sliding expiration), and bounded concurrency throttling (`SemaphoreSlim` / rate-limited batching) to guarantee zero upstream overload of the Firebase Hacker News API.
- **Confirmed Decision 2 (Architecture Pattern)**: Clean, idiomatic ASP.NET Core architecture structured into `Controllers` (`StoriesController`), `Services` (`HackerNewsService`), `Clients` (typed `HttpClient` with Microsoft Polly resilience policies), `Models` (DTOs matching exact schema contract), and an `xUnit` test suite with MockHttp.
- **Confirmed Decision 3 (Interactive Delivery)**: In addition to the full C# codebase files, Dockerfile, docker-compose, and `README.md`, the platform provides an interactive developer workbench with live API execution, parameter controls (`n`), raw JSON response inspector, cache hit/miss latency monitor, and full repository code viewer/export.

---

## 1. Overview & Core Concept

### What It Does
The system implements the RESTful endpoint:
`GET /api/stories/best?n={n}` (with alias `GET /api/beststories?n={n}`)

It fetches up to $n$ best stories from Hacker News (`https://hacker-news.firebaseio.com/v0/beststories.json`), queries each individual story (`/v0/item/{id}.json`), filters non-story or invalid items, sorts them in descending order of `score`, and transforms them into the exact required contract:
```json
[
  {
    "title": "A uBlock Origin update was rejected from the Chrome Web Store",
    "uri": "https://github.com/uBlockOrigin/uBlock-issues/issues/745",
    "postedBy": "ismaildonmez",
    "time": "2019-10-12T13:43:01+00:00",
    "score": 1716,
    "commentCount": 572
  }
]
```

### Protection Against Hacker News API Overload
1. **Background Cache Warming**: Hacker News updates "best stories" over minutes, not milliseconds. A background service periodically polls the ~200 best story IDs every 60–120 seconds.
2. **Individual Story Item Cache**: Each story item (`/v0/item/{id}.json`) has immutable historical attributes (author, creation time, url). Story scores and comment counts change slowly. Individual items are cached in memory for 10 minutes.
3. **Bounded Concurrency & Throttling**: Parallel fetching of uncached story IDs is governed by a bounded semaphore (e.g., maximum 10–20 concurrent HTTP requests to Firebase), preventing socket starvation and avoiding IP rate-limiting from Firebase.
4. **Single-Flight Coalescing**: If multiple concurrent callers request stories while an uncached item is being retrieved, requests coalesce onto the same task rather than generating duplicate upstream HTTP requests.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Live Interactive API Console**:
   - Callers can input $n$ (1 to 200, with validation bounds), trigger live requests against the real Hacker News endpoints, and inspect response time, payload size, and cache status (HIT vs MISS).
   - View formatted table cards with exact score badges, author, formatted ISO 8601 UTC time, comment count, and story links.
   - One-click copy or download of raw JSON output matching the specification.
2. **High-Load Simulation & Benchmark**:
   - Send concurrent bursts (e.g. 50 parallel requests) to demonstrate that after the initial warm-up, response latency drops to < 5ms with zero additional calls to the upstream Firebase API.
3. **ASP.NET Core Solution Explorer & Docs**:
   - Tabbed source browser allowing immediate inspection of every production C# file:
     - `Program.cs` (Dependency injection, Polly resilience pipeline, rate limiter)
     - `Controllers/StoriesController.cs` (Validation, action filters, OpenAPI annotations)
     - `Services/IHackerNewsService.cs` & `HackerNewsService.cs` (Cached data fetcher)
     - `BackgroundServices/StoryCacheBackgroundRefresher.cs` (Proactive sync worker)
     - `Models/StoryDto.cs` & `HackerNewsItem.cs` (DTO serialization, Unix epoch converters)
     - `HackerNewsApi.Tests/StoriesControllerTests.cs` (xUnit tests with mocking)
     - `Dockerfile` & `docker-compose.yml` (Production container deployment)
     - `README.md` (Design assumptions, running instructions, scaling roadmap)
   - One-click "Download Complete Solution ZIP" or copy individual files.

### Visual Identity & Theme
- **Theme**: Clean developer console aesthetic in neutral dark slate (`#0B0F19` canvas, `#111827` cards, `#1F2937` borders) with crisp typography and subtle cyan/emerald status highlights.
- **Typography**: Display headings in `Plus Jakarta Sans`, scannable body text in `Public Sans`, and telemetry/JSON data in `JetBrains Mono` with strict `font-variant-numeric: tabular-nums`.
- **Zero-Pill Discipline**: Metadata (author, time, comment counts) rendered as unboxed typography with typographic separators (`·`), avoiding cluttered badge capsules.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Caching Strategy (Memory Cache + Background Pre-Warming)
- *Chosen Approach*: Two-tier in-process caching using `IMemoryCache` combined with a `BackgroundService` that pre-fetches the best stories list.
- *Why*: The best stories endpoint returns IDs that change gradually. By pre-warming the top 200 stories in memory, incoming user requests are answered in sub-millisecond time directly from RAM without contacting Firebase at all.
- *Alternatives Considered*: Direct pass-through on every request was rejected because it would overload Hacker News with hundreds of HTTP requests per query. Redis distributed cache is documented in the architecture as the horizontal scale step for multi-instance deployments.

### Decision 2: Concurrency Throttling via SemaphoreSlim
- *Chosen Approach*: Concurrency limiter (`SemaphoreSlim(20)`) wrapped inside the typed `HttpClient` service for uncached story details.
- *Why*: If a cold start occurs or a user requests $n=200$, making 200 uncontrolled parallel requests would flood the client's network stack and trigger HTTP 429/503 from Firebase. A bounded semaphore smooths traffic into steady batches.

### Decision 3: Input Validation and Graceful Edge Cases
- *Chosen Approach*: $n$ is validated ($1 \le n \le 200$, defaulting to 10 or 20). If Hacker News API returns fewer than $n$ stories or an item is deleted/null, the API gracefully handles the gap and returns all available valid stories sorted by score descending.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Client / Consumer Request                       │
│                        GET /api/stories/best?n=20                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  ASP.NET Core Web API (Kestrel Host)                   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Controllers / Minimal API Endpoints                            │   │
│   │ [HttpGet("best")] -> StoriesController                        │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ IHackerNewsService / HackerNewsService                         │   │
│   │                                                                │   │
│   │   1. Read Best Story IDs from IMemoryCache                     │   │
│   │      (Cached by BackgroundWorker or on-demand warm-up)         │   │
│   │                                                                │   │
│   │   2. Fetch individual stories via Concurrent Dictionary /      │   │
│   │      MemoryCache lookup                                        │   │
│   │                                                                │   │
│   │   3. Sort by Score DESC & Take(n) -> Map to StoryDto           │   │
│   └───────────────────────┬────────────────┬───────────────────────┘   │
│                           │                │                           │
│                           │ Cache Miss     │ Periodic Warmup           │
│                           ▼                ▼                           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Resilient HttpClient (Polly Retry + Semaphore Bounded Limit)   │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ HTTPS (JSON)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Hacker News Firebase API                        │
│   - /v0/beststories.json                                               │
│   - /v0/item/{id}.json                                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Contract & Schema Mapping

| Hacker News Item Source (`/v0/item/{id}.json`) | Required Response DTO (`StoryDto`) | Transformation / Format |
| :--- | :--- | :--- |
| `title` (string) | `title` (string) | Direct mapping |
| `url` (string) | `uri` (string) | If null/empty (Ask HN), falls back to HN item URL |
| `by` (string) | `postedBy` (string) | Direct mapping |
| `time` (long Unix seconds) | `time` (string) | ISO 8601 UTC string (`yyyy-MM-ddTHH:mm:ss+00:00`) |
| `score` (int) | `score` (int) | Direct mapping (used for descending sort) |
| `descendants` (int) | `commentCount` (int) | Null coalesced to `0` |

### Solution Structure
```
HackerNewsBestStoriesApi/
├── src/
│   └── HackerNewsBestStoriesApi/
│       ├── Controllers/
│       │   └── StoriesController.cs
│       ├── Models/
│       │   ├── HackerNewsItem.cs
│       │   └── StoryDto.cs
│       ├── Services/
│       │   ├── IHackerNewsService.cs
│       │   └── HackerNewsService.cs
│       ├── BackgroundServices/
│       │   └── StoryCacheBackgroundRefresher.cs
│       ├── Options/
│       │   └── HackerNewsOptions.cs
│       ├── appsettings.json
│       ├── Program.cs
│       └── HackerNewsBestStoriesApi.csproj
├── tests/
│   └── HackerNewsBestStoriesApi.Tests/
│       ├── StoriesControllerTests.cs
│       ├── HackerNewsServiceTests.cs
│       └── HackerNewsBestStoriesApi.Tests.csproj
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── HackerNewsBestStoriesApi.sln
└── README.md
```

### Interactive Workbench Components
- **Live Proxy Endpoint**: Native Node/Express proxy matching the identical ASP.NET Core logic, caching, and serialization so the interface can run against real Hacker News data live inside the sandbox.
- **Interactive Story Feed**: Real-time story explorer with score sorting, fast filters, and direct links.
- **Performance & Overload Protection Visualizer**: Real-time counter of total requests, cache hits, cache misses, upstream calls prevented, and average latency.
- **Full Solution Repository Explorer & Download**: Interactive tree and code editor view for all C# files, configuration, tests, Dockerfile, and README, with a "Download Entire Repository (.zip)" action.
