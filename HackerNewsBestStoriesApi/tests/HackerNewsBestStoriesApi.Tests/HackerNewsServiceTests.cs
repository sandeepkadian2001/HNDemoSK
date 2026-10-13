namespace HackerNewsBestStoriesApi.Tests;

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using HackerNewsBestStoriesApi.Models;
using HackerNewsBestStoriesApi.Options;
using HackerNewsBestStoriesApi.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using RichardSzalay.MockHttp;
using Xunit;

public class HackerNewsServiceTests
{
    private readonly MockHttpMessageHandler _mockHttp;
    private readonly IMemoryCache _memoryCache;
    private readonly IOptions<HackerNewsOptions> _options;
    private readonly Mock<ILogger<HackerNewsService>> _mockLogger;

    public HackerNewsServiceTests()
    {
        _mockHttp = new MockHttpMessageHandler();
        _memoryCache = new MemoryCache(new MemoryCacheOptions());
        _options = Microsoft.Extensions.Options.Options.Create(new HackerNewsOptions
        {
            BaseUrl = "https://hacker-news.firebaseio.com/v0/",
            StoryItemCacheDurationMinutes = 5,
            BestStoriesCacheDurationMinutes = 2,
            MaxConcurrentOutgoingRequests = 5,
            MaxStoryLimit = 100
        });
        _mockLogger = new Mock<ILogger<HackerNewsService>>();
    }

    [Fact]
    public async Task GetBestStoriesAsync_ReturnsStoriesSortedByScoreDescending()
    {
        // Arrange
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/beststories.json")
            .Respond("application/json", "[101, 102, 103]");

        // Story 101: score 100
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/101.json")
            .Respond("application/json", @"{
                ""id"": 101,
                ""type"": ""story"",
                ""by"": ""alice"",
                ""time"": 1570887781,
                ""url"": ""https://example.com/alice"",
                ""score"": 100,
                ""title"": ""Alice's Story"",
                ""descendants"": 12
            }");

        // Story 102: score 500 (highest)
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/102.json")
            .Respond("application/json", @"{
                ""id"": 102,
                ""type"": ""story"",
                ""by"": ""bob"",
                ""time"": 1570887800,
                ""url"": ""https://example.com/bob"",
                ""score"": 500,
                ""title"": ""Bob's High Score Story"",
                ""descendants"": 85
            }");

        // Story 103: score 250
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/103.json")
            .Respond("application/json", @"{
                ""id"": 103,
                ""type"": ""story"",
                ""by"": ""charlie"",
                ""time"": 1570887900,
                ""url"": ""https://example.com/charlie"",
                ""score"": 250,
                ""title"": ""Charlie's Story"",
                ""descendants"": 30
            }");

        var httpClient = _mockHttp.ToHttpClient();
        httpClient.BaseAddress = new Uri("https://hacker-news.firebaseio.com/v0/");

        var service = new HackerNewsService(httpClient, _memoryCache, _options, _mockLogger.Object);

        // Act
        var result = await service.GetBestStoriesAsync(3);

        // Assert
        Assert.Equal(3, result.Count);
        Assert.Equal("Bob's High Score Story", result[0].Title);
        Assert.Equal(500, result[0].Score);
        Assert.Equal("Charlie's Story", result[1].Title);
        Assert.Equal(250, result[1].Score);
        Assert.Equal("Alice's Story", result[2].Title);
        Assert.Equal(100, result[2].Score);
    }

    [Fact]
    public async Task GetBestStoriesAsync_FiltersNonStoryAndDeletedItems()
    {
        // Arrange
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/beststories.json")
            .Respond("application/json", "[201, 202, 203]");

        // Story 201: deleted
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/201.json")
            .Respond("application/json", @"{
                ""id"": 201,
                ""deleted"": true,
                ""type"": ""story"",
                ""score"": 400
            }");

        // Story 202: comment type instead of story
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/202.json")
            .Respond("application/json", @"{
                ""id"": 202,
                ""type"": ""comment"",
                ""by"": ""troll"",
                ""score"": 999
            }");

        // Story 203: valid story
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/203.json")
            .Respond("application/json", @"{
                ""id"": 203,
                ""type"": ""story"",
                ""by"": ""dan"",
                ""time"": 1570887781,
                ""url"": ""https://example.com/valid"",
                ""score"": 300,
                ""title"": ""Only Valid Story"",
                ""descendants"": 5
            }");

        var httpClient = _mockHttp.ToHttpClient();
        httpClient.BaseAddress = new Uri("https://hacker-news.firebaseio.com/v0/");

        var service = new HackerNewsService(httpClient, _memoryCache, _options, _mockLogger.Object);

        // Act
        var result = await service.GetBestStoriesAsync(2);

        // Assert
        Assert.Single(result);
        Assert.Equal("Only Valid Story", result[0].Title);
        Assert.Equal("dan", result[0].PostedBy);
    }

    [Fact]
    public async Task GetBestStoriesAsync_FallsBackToHnUrl_WhenStoryUrlIsEmpty()
    {
        // Arrange
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/beststories.json")
            .Respond("application/json", "[301]");

        // Ask HN post without external url
        _mockHttp.When("https://hacker-news.firebaseio.com/v0/item/301.json")
            .Respond("application/json", @"{
                ""id"": 301,
                ""type"": ""story"",
                ""by"": ""inquirer"",
                ""time"": 1570887781,
                ""score"": 150,
                ""title"": ""Ask HN: Best developer books?"",
                ""descendants"": 40
            }");

        var httpClient = _mockHttp.ToHttpClient();
        httpClient.BaseAddress = new Uri("https://hacker-news.firebaseio.com/v0/");

        var service = new HackerNewsService(httpClient, _memoryCache, _options, _mockLogger.Object);

        // Act
        var result = await service.GetBestStoriesAsync(1);

        // Assert
        Assert.Single(result);
        Assert.Equal("https://news.ycombinator.com/item?id=301", result[0].Uri);
    }

    /// <summary>
    /// Custom delegating handler that intercepts and counts every outbound HTTP request issued by HttpClient.
    /// </summary>
    private class CountingHttpMessageHandler : HttpMessageHandler
    {
        private int _totalInvocations;
        public int TotalInvocations => _totalInvocations;

        public ConcurrentDictionary<string, int> InvocationsByEndpoint { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _totalInvocations);
            var uri = request.RequestUri?.PathAndQuery ?? request.RequestUri?.ToString() ?? "unknown";
            InvocationsByEndpoint.AddOrUpdate(uri, 1, (_, count) => count + 1);

            // Mock response for beststories.json with 250 candidate IDs
            if (uri.Contains("beststories.json"))
            {
                var ids = Enumerable.Range(1001, 250).ToArray();
                var json = JsonSerializer.Serialize(ids);
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                });
            }

            // Mock responses for individual items
            if (uri.Contains("item/"))
            {
                var parts = uri.Split('/');
                var filename = parts[^1];
                var idStr = filename.Replace(".json", "");
                int.TryParse(idStr, out int id);

                var item = new HackerNewsItem
                {
                    Id = id,
                    Type = "story",
                    By = $"user_{id}",
                    Time = 1570887781 + id,
                    Score = 3000 - (id - 1000) * 10,
                    Title = $"Story Title #{id}",
                    Url = $"https://example.com/story/{id}",
                    Descendants = 50 + id % 25
                };

                var json = JsonSerializer.Serialize(item);
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }

    [Fact]
    public async Task Simultaneous_10000_Service_Calls_Should_Not_Overload_Upstream_HttpClient()
    {
        // ARRANGE: Set up counting handler and service
        const int concurrentRequests = 10000;

        var handler = new CountingHttpMessageHandler();
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://hacker-news.firebaseio.com/v0/")
        };

        var cache = new MemoryCache(new MemoryCacheOptions());
        var options = Microsoft.Extensions.Options.Options.Create(new HackerNewsOptions
        {
            BaseUrl = "https://hacker-news.firebaseio.com/v0/",
            StoryItemCacheDurationMinutes = 10,
            BestStoriesCacheDurationMinutes = 2,
            MaxConcurrentOutgoingRequests = 20,
            MaxStoryLimit = 200
        });

        using var service = new HackerNewsService(httpClient, cache, options, NullLogger<HackerNewsService>.Instance);

        // ACT: Fire 10,000 simultaneous asynchronous service calls concurrently,
        // with requestedN dynamically varying between 1 and 200 for every single call
        var tasks = Enumerable.Range(0, concurrentRequests).Select(i =>
        {
            // Dynamic value strictly between 1 and 200 for each of the 10,000 requests
            int dynamicN = (i % 200) + 1;
            return Task.Run(async () =>
            {
                var stories = await service.GetBestStoriesAsync(dynamicN);
                return (RequestedN: dynamicN, Stories: stories);
            });
        }).ToList();

        var results = await Task.WhenAll(tasks);

        // ASSERT: Validate all 10,000 calls succeeded and returned their specific dynamic N
        Assert.Equal(concurrentRequests, results.Length);
        foreach (var (requestedN, stories) in results)
        {
            Assert.Equal(requestedN, stories.Count);
            for (int j = 0; j < stories.Count - 1; j++)
            {
                Assert.True(stories[j].Score >= stories[j + 1].Score, "Stories must be sorted in descending order of score.");
            }
        }

        // METRICS: Note down how many times HttpClient-based API was invoked
        int totalHttpClientCalls = handler.TotalInvocations;

        // Even though 10,000 concurrent calls requested dynamic N from 1 to 200
        // (totaling over 1,000,000 potential item fetches without caching),
        // the HttpClient was invoked at most once per distinct story ID (<= 225 calls).
        Assert.True(totalHttpClientCalls <= 225,
            $"HttpClient was invoked {totalHttpClientCalls} times. Expected <= 225 under 10,000 concurrent calls with dynamic n in [1, 200].");
        Assert.Equal(1, handler.InvocationsByEndpoint["/v0/beststories.json"]);
    }

    [Fact]
    public async Task WarmUpCacheAsync_LoadsAllStoriesReturnedByFetchBestStoryIdsFromApiAsync()
    {
        // Arrange
        var handler = new CountingHttpMessageHandler();
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://hacker-news.firebaseio.com/v0/")
        };

        var cache = new MemoryCache(new MemoryCacheOptions());
        var options = Microsoft.Extensions.Options.Options.Create(new HackerNewsOptions
        {
            BaseUrl = "https://hacker-news.firebaseio.com/v0/",
            StoryItemCacheDurationMinutes = 10,
            BestStoriesCacheDurationMinutes = 2,
            MaxConcurrentOutgoingRequests = 20,
            MaxStoryLimit = 200
        });

        using var service = new HackerNewsService(httpClient, cache, options, NullLogger<HackerNewsService>.Instance);

        // Act: Execute cache warmup
        await service.WarmUpCacheAsync();

        // Assert: Best stories IDs were fetched (1 call) and ALL stories returned were loaded into cache
        Assert.Equal(1, handler.InvocationsByEndpoint["/v0/beststories.json"]);
        Assert.True(handler.TotalInvocations > 1, "Warmup must load all story details into cache.");

        // Subsequent query must hit the warm cache immediately with ZERO additional HttpClient calls
        int invocationsBeforeQuery = handler.TotalInvocations;
        var stories = await service.GetBestStoriesAsync(50);

        Assert.Equal(50, stories.Count);
        Assert.Equal(invocationsBeforeQuery, handler.TotalInvocations); // Zero new network calls!
    }
}
