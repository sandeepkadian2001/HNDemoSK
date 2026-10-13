# Hacker News Best Stories RESTful API

[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet)](https://dotnet.microsoft.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)

A high-performance, resilient RESTful API built with **ASP.NET Core 10** (.NET 10) that retrieves and ranks the best *n* stories from the official [Hacker News Firebase API](https://github.com/HackerNews/API), ordered by their score descending.

---

## Table of Contents
1. [Overview & API Contract](#overview--api-contract)
2. [Architecture & Overload Protection Strategy](#architecture--overload-protection-strategy)
3. [Prerequisites](#prerequisites)
4. [How to Run the Application](#how-to-run-the-application)
   - [Option A: Running Locally via .NET CLI](#option-a-running-locally-via-net-cli)
   - [Option B: Running with Docker & Docker Compose](#option-b-running-with-docker--docker-compose)
   - [Option C: Running Tests](#option-c-running-tests)
5. [API Specification & Examples](#api-specification--examples)
6. [Assumptions Made](#assumptions-made)
7. [Enhancements & Production Roadmap (Given More Time)](#enhancements--production-roadmap-given-more-time)

---

## Overview & API Contract

The API exposes a RESTful endpoint to retrieve the top $n$ stories sorted by score descending:

```http
GET /api/stories/best?n=10
```

### Exact Response Contract
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

---

## Architecture & Overload Protection Strategy

Servicing large volumes of concurrent consumer traffic while querying an upstream public API with hundreds of individual entity calls poses severe risks:
- Hacker News rate limiting / IP bans (HTTP 429).
- TCP socket exhaustion on the host server.
- High latency caused by individual item requests over network boundaries.

To eliminate these risks, the application implements a multi-tiered defense:

### 1. Proactive Background Cache Warming (`StoryCacheBackgroundRefresher`)
- It queries the upstream `/v0/beststories.json` and pre-loads all story items returned into memory (`IMemoryCache`), ensuring all subsequent queries (even for maximum $n=200$) hit warm memory instantly.
- **Result**: Incoming consumer requests are answered directly from local memory in **< 2ms**, completely isolating Hacker News from incoming traffic spikes.

### 2. Bounded Concurrency Throttling (`SemaphoreSlim`)
- Direct fan-out queries (`Task.WhenAll`) without bounds can launch 200–500 simultaneous socket requests.
- All outbound requests to Hacker News Firebase endpoints are piped through an asynchronous `SemaphoreSlim` limit (default: 20 concurrent HTTP requests).
- This prevents TCP starvation, reduces memory pressure, and respects upstream service boundaries.

### 3. Request Coalescing (SingleFlight Pattern)
- When a cache miss occurs on an item while multiple concurrent clients request it simultaneously, a thread-safe `ConcurrentDictionary<int, Task<StoryDto?>>` coordinates the pending retrieval.
- Only **one** upstream HTTP request is issued; all concurrent callers await the same task.

### 4. HTTP Resilience Policies (Polly)
- The typed `HttpClient` is wrapped with Polly resilience policies:
  - **Exponential Backoff with Jitter**: Automatically retries transient 5xx, 408, or connection failures ($200\text{ms} \times 2^r + \text{jitter}$).
  - **Circuit Breaker**: Breaks the circuit after 5 consecutive failures for 30 seconds to allow upstream systems to recover.
  - **Cancellation Tokens**: All asynchronous methods propagate `CancellationToken` to avoid orphan work when clients disconnect.

### 5. API Rate Limiting Middleware
- ASP.NET Core rate limiting middleware enforces a fixed window policy (e.g. 100 requests/second with a queue limit of 50) to protect the API itself from denial-of-service abuse.

---

## Prerequisites

- [.NET 10.0 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) or later.
- [Docker](https://www.docker.com/) (optional, for containerized run).

---

## How to Run the Application

### Option A: Running Locally via .NET CLI

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/hackernews-best-stories-api.git
   cd hackernews-best-stories-api
   ```

2. **Restore dependencies & Build**:
   ```bash
   dotnet restore
   dotnet build
   ```

3. **Run the API**:
   ```bash
   dotnet run --project src/HackerNewsBestStoriesApi
   ```

4. **Access the API**:
   - The API will listen on `http://localhost:5000` (or `https://localhost:5001`).
   - Open Swagger documentation: `http://localhost:5000/swagger`
   - Test the endpoint:
     ```bash
     curl "http://localhost:5000/api/stories/best?n=10"
     ```

---

### Option B: Running with Docker & Docker Compose

1. **Build and run via Docker Compose**:
   ```bash
   docker-compose up --build
   ```

2. **Send test request**:
   ```bash
   curl "http://localhost:8080/api/stories/best?n=5"
   ```

3. **Check health status**:
   ```bash
   curl "http://localhost:8080/health"
   ```

---

### Option C: Running Tests

The test suite contains unit and integration tests using `xUnit`, `Moq`, and `RichardSzalay.MockHttp`:

```bash
dotnet test
```

Tests cover:
- **Load Test under 10,000 Simultaneous Calls with Dynamic `n` (1–200)**: Simulates 10,000 concurrent requests where each call requests a dynamic value of $n$ varying between 1 and 200, verifying that upstream `HttpClient` invocations are capped ($\le 225$ calls), preventing over 1,000,000 potential requests.
- **Validation**: Parameter validation for `n <= 0` and `n > MaxLimit`.
- **Sorting**: Correct sorting by `score` in descending order.
- **Filtering**: Filtering of non-story items (`type == "comment"`, `deleted == true`, `dead == true`).
- **URL Resolution**: Fallback URI resolution for internal discussion posts (Ask HN / Show HN without external URL).
- **Date Formatting**: ISO 8601 UTC date string format (`yyyy-MM-ddTHH:mm:ss+00:00`).

To run the tests:
```bash
dotnet test --logger "console;verbosity=detailed"
```

---

## API Specification & Examples

### Endpoint: `GET /api/stories/best`

#### Query Parameters:
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `n` | `integer` | No | `10` | Number of best stories to return ($1 \le n \le 200$). |

#### Responses:
- **`200 OK`**: Returns array of story objects.
- **`400 Bad Request`**: Returned when `n < 1` or `n > 200`. Returns RFC 7807 `ProblemDetails`.
- **`429 Too Many Requests`**: Returned when client rate limit is exceeded.
- **`500 Internal Server Error`**: Unexpected server fault.

#### Example cURL:
```bash
curl -X GET "http://localhost:5000/api/stories/best?n=3" \
     -H "Accept: application/json"
```

#### Example Output:
```json
[
  {
    "title": "A uBlock Origin update was rejected from the Chrome Web Store",
    "uri": "https://github.com/uBlockOrigin/uBlock-issues/issues/745",
    "postedBy": "ismaildonmez",
    "time": "2019-10-12T13:43:01+00:00",
    "score": 1716,
    "commentCount": 572
  },
  {
    "title": "Stephen Hawking has died",
    "uri": "http://www.bbc.co.uk/news/uk-43396008",
    "postedBy": "sidcool",
    "time": "2018-03-14T03:52:12+00:00",
    "score": 1600,
    "commentCount": 436
  },
  {
    "title": "Show HN: SQLite in the browser",
    "uri": "https://news.ycombinator.com/item?id=31742019",
    "postedBy": "sqlite_fan",
    "time": "2022-06-14T18:22:00+00:00",
    "score": 1420,
    "commentCount": 289
  }
]
```

---

## Assumptions Made

1. **Ordering Criteria**: The requirement states "as determined by their score ... in descending order of score". Because the Hacker News `/beststories.json` endpoint ranks stories using an algorithm factoring both score and time, this API takes the candidate set of best stories and sorts them strictly by `score` descending before returning the top $n$.
2. **Missing External URLs**: Some Hacker News items (e.g. Ask HN, Show HN text submissions, or polls) do not have an external `url` property. For these items, `uri` gracefully falls back to the Hacker News item URL (`https://news.ycombinator.com/item?id={id}`).
3. **Item Type Filtering**: Only items with `type: "story"` that are not flagged as `deleted: true` or `dead: true` are considered valid stories.
4. **Upper Bound on `n`**: The Hacker News Firebase API `/beststories.json` provides an array of up to 200 (sometimes 500) item IDs. Requesting $n > 200$ is bounded by configuration (`MaxStoryLimit = 200`) to prevent unrealistic allocations.
5. **Score Stability**: Hacker News story scores fluctuate slowly. Caching individual item payloads for 10 minutes with a sliding 2-minute refresh strikes an optimal balance between freshness and total upstream protection.

---

## Enhancements & Production Roadmap (Given More Time)

If extended for multi-region tier-1 enterprise production, the following enhancements would be added:

1. **Distributed Caching with Redis (`IDistributedCache`)**:
   - Replace or tier `IMemoryCache` with a Redis cluster (`Microsoft.Extensions.Caching.StackExchangeRedis`) so multiple horizontally scaled API instances share the same warmed cache without duplicating upstream fetches.
2. **Hacker News Firebase Realtime Streaming (Server-Sent Events / WebSocket)**:
   - Instead of polling `/beststories.json` every 60 seconds, connect to Firebase Realtime Database event streams (`/v0/beststories.json` with SSE `text/event-stream`) to receive instantaneous updates whenever the list changes.
3. **OpenTelemetry & Distributed Tracing**:
   - Add OpenTelemetry metrics and traces for request durations, cache hit ratio counters, and external HTTP dependency latency, exported to Prometheus/Grafana or Azure Application Insights.
4. **Response Compression**:
   - Enable Gzip / Brotli response compression middleware (`Microsoft.AspNetCore.ResponseCompression`) for payloads with large $n$.
5. **Conditional HTTP GET (ETag / If-None-Match)**:
   - Support `ETag` calculation based on the hash of the sorted IDs to return `304 Not Modified` when client polling detects no changes.
6. **GraphQL / gRPC Projections**:
   - Offer optional gRPC and GraphQL interfaces for high-throughput microservice consumers requiring binary serialization or custom field projections.
