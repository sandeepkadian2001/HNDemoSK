namespace HackerNewsBestStoriesApi.Services;

using System.Collections.Concurrent;
using System.Net.Http.Json;
using HackerNewsBestStoriesApi.Models;
using HackerNewsBestStoriesApi.Options;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

/// <summary>
/// Production implementation of IHackerNewsService featuring proactive caching,
/// in-memory sliding storage, request deduplication (SingleFlight), and bounded concurrency.
/// </summary>
public class HackerNewsService : IHackerNewsService, IDisposable
{
    private const string BestStoryIdsCacheKey = "HN_BEST_STORY_IDS";
    private const string StoryItemCacheKeyPrefix = "HN_STORY_ITEM_";

    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _cache;
    private readonly HackerNewsOptions _options;
    private readonly ILogger<HackerNewsService> _logger;
    private readonly SemaphoreSlim _concurrencySemaphore;
    private readonly ConcurrentDictionary<int, Task<StoryDto?>> _inFlightItemTasks = new();

    public HackerNewsService(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        IOptions<HackerNewsOptions> options,
        ILogger<HackerNewsService> logger)
        : this(
            (httpClientFactory ?? throw new ArgumentNullException(nameof(httpClientFactory))).CreateClient("HackerNews"),
            cache,
            options,
            logger)
    {
    }

    public HackerNewsService(
        HttpClient httpClient,
        IMemoryCache cache,
        IOptions<HackerNewsOptions> options,
        ILogger<HackerNewsService> logger)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _cache = cache ?? throw new ArgumentNullException(nameof(cache));
        _options = options?.Value ?? new HackerNewsOptions();
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));

        int maxConcurrency = Math.Max(1, _options.MaxConcurrentOutgoingRequests);
        _concurrencySemaphore = new SemaphoreSlim(maxConcurrency, maxConcurrency);
    }

    public async Task<IReadOnlyList<StoryDto>> GetBestStoriesAsync(int n, CancellationToken cancellationToken = default)
    {
        if (n <= 0)
        {
            return Array.Empty<StoryDto>();
        }

        // 1. Retrieve the list of best story IDs (cached or fetched)
        var storyIds = await GetBestStoryIdsAsync(cancellationToken);
        if (storyIds == null || storyIds.Count == 0)
        {
            _logger.LogWarning("No story IDs retrieved from Hacker News API.");
            return Array.Empty<StoryDto>();
        }

        // We fetch enough stories from the best list to satisfy 'n'
        // Hacker News /v0/beststories.json typically returns up to 200 or 500 IDs
        var idsToFetch = storyIds.Take(Math.Max(n, Math.Min(storyIds.Count, n + 20))).ToList();

        // 2. Fetch all story details concurrently, subject to SemaphoreSlim throttling and SingleFlight caching
        var tasks = idsToFetch.Select(id => GetStoryByIdAsync(id, cancellationToken));
        var stories = await Task.WhenAll(tasks);

        // 3. Filter valid stories, sort strictly descending by score, and take n
        var result = stories
            .Where(s => s != null)
            .Select(s => s!)
            .OrderByDescending(s => s.Score)
            .Take(n)
            .ToList();

        return result;
    }

    public async Task WarmUpCacheAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Warming up Hacker News story cache with all best stories...");
            var storyIds = await FetchBestStoryIdsFromApiAsync(cancellationToken);
            if (storyIds != null && storyIds.Count > 0)
            {
                // Store IDs in cache
                _cache.Set(
                    BestStoryIdsCacheKey,
                    storyIds,
                    TimeSpan.FromMinutes(_options.BestStoriesCacheDurationMinutes));

                // Load ALL stories returned by FetchBestStoryIdsFromApiAsync to warm the cache to speed up subsequent queries
                var tasks = storyIds.Select(id => GetStoryByIdAsync(id, cancellationToken));
                await Task.WhenAll(tasks);

                _logger.LogInformation("Successfully warmed cache with all {Count} best stories.", storyIds.Count);
            }
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(ex, "Error occurred during background cache warmup.");
        }
    }

    private async Task<IReadOnlyList<int>> GetBestStoryIdsAsync(CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(BestStoryIdsCacheKey, out IReadOnlyList<int>? cachedIds) && cachedIds != null)
        {
            return cachedIds;
        }

        var fetchedIds = await FetchBestStoryIdsFromApiAsync(cancellationToken);
        if (fetchedIds != null && fetchedIds.Count > 0)
        {
            _cache.Set(
                BestStoryIdsCacheKey,
                fetchedIds,
                TimeSpan.FromMinutes(_options.BestStoriesCacheDurationMinutes));

            // Load all stories returned by FetchBestStoryIdsFromApiAsync to warm the cache for subsequent queries
            _ = Task.Run(async () =>
            {
                try
                {
                    var tasks = fetchedIds.Select(id => GetStoryByIdAsync(id, CancellationToken.None));
                    await Task.WhenAll(tasks);
                    _logger.LogInformation("Completed loading all {Count} stories into warm cache.", fetchedIds.Count);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Background warming of all fetched story items encountered an error.");
                }
            });

            return fetchedIds;
        }

        return Array.Empty<int>();
    }

    private async Task<IReadOnlyList<int>> FetchBestStoryIdsFromApiAsync(CancellationToken cancellationToken)
    {
        try
        {
            var ids = await _httpClient.GetFromJsonAsync<int[]>("beststories.json", cancellationToken);
            return ids ?? Array.Empty<int>();
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(ex, "Failed to retrieve best story IDs from Hacker News API.");
            return Array.Empty<int>();
        }
    }

    public async Task<StoryDto?> GetStoryByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        string cacheKey = $"{StoryItemCacheKeyPrefix}{id}";

        // Fast path: in-memory cache hit
        if (_cache.TryGetValue(cacheKey, out StoryDto? cachedStory))
        {
            return cachedStory;
        }

        // SingleFlight coalescing: Ensure multiple concurrent requests for the same ID share the same task
        return await _inFlightItemTasks.GetOrAdd(id, async itemId =>
        {
            try
            {
                await _concurrencySemaphore.WaitAsync(cancellationToken);
                try
                {
                    // Check cache again in case another thread populated it while waiting for semaphore
                    if (_cache.TryGetValue(cacheKey, out StoryDto? storyUnderLock))
                    {
                        return storyUnderLock;
                    }

                    var rawItem = await _httpClient.GetFromJsonAsync<HackerNewsItem>(
                        $"item/{itemId}.json",
                        cancellationToken);

                    if (rawItem == null || rawItem.Deleted || rawItem.Dead || rawItem.Type != "story")
                    {
                        return null;
                    }

                    var dto = MapToDto(rawItem);

                    _cache.Set(
                        cacheKey,
                        dto,
                        new MemoryCacheEntryOptions
                        {
                            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(_options.StoryItemCacheDurationMinutes),
                            SlidingExpiration = TimeSpan.FromMinutes(2)
                        });

                    return dto;
                }
                finally
                {
                    _concurrencySemaphore.Release();
                }
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Failed to fetch details for Hacker News item ID {ItemId}", itemId);
                return null;
            }
            finally
            {
                _inFlightItemTasks.TryRemove(itemId, out _);
            }
        });
    }

    private static StoryDto MapToDto(HackerNewsItem item)
    {
        // Format ISO 8601 with UTC offset explicitly matching requirement "2019-10-12T13:43:01+00:00"
        var dateTimeOffset = DateTimeOffset.FromUnixTimeSeconds(item.Time).ToUniversalTime();
        string formattedTime = dateTimeOffset.ToString("yyyy-MM-ddTHH:mm:ss+00:00");

        // Fallback uri to HN discussion page if url is empty (e.g., Ask HN or Show HN text posts)
        string uri = !string.IsNullOrWhiteSpace(item.Url)
            ? item.Url
            : $"https://news.ycombinator.com/item?id={item.Id}";

        return new StoryDto
        {
            Title = item.Title ?? "Untitled Story",
            Uri = uri,
            PostedBy = item.By ?? "anonymous",
            Time = formattedTime,
            Score = item.Score,
            CommentCount = item.Descendants ?? 0
        };
    }

    public void Dispose()
    {
        _concurrencySemaphore.Dispose();
        GC.SuppressFinalize(this);
    }
}
