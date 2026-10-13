namespace HackerNewsBestStoriesApi.Tests;

using System.Net;
using HackerNewsBestStoriesApi.Options;
using HackerNewsBestStoriesApi.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
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
}
