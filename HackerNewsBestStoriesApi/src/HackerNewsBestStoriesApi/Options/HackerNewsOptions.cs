namespace HackerNewsBestStoriesApi.Options;

/// <summary>
/// Configuration options for the Hacker News API client and caching behavior.
/// </summary>
public class HackerNewsOptions
{
    public const string SectionName = "HackerNews";

    /// <summary>
    /// Base URL of the Hacker News Firebase API. Default is https://hacker-news.firebaseio.com/v0/
    /// </summary>
    public string BaseUrl { get; set; } = "https://hacker-news.firebaseio.com/v0/";

    /// <summary>
    /// How long to cache individual story items in minutes. Default is 10.
    /// </summary>
    public int StoryItemCacheDurationMinutes { get; set; } = 10;

    /// <summary>
    /// How long to cache the list of best story IDs in minutes. Default is 2.
    /// </summary>
    public int BestStoriesCacheDurationMinutes { get; set; } = 2;

    /// <summary>
    /// Maximum concurrent outgoing HTTP requests allowed to Hacker News API to prevent socket exhaustion and rate limits.
    /// </summary>
    public int MaxConcurrentOutgoingRequests { get; set; } = 20;

    /// <summary>
    /// Background refresher interval in seconds for proactive cache warming.
    /// </summary>
    public int BackgroundRefreshIntervalSeconds { get; set; } = 60;

    /// <summary>
    /// Maximum allowable value for query parameter 'n'. Default is 200.
    /// </summary>
    public int MaxStoryLimit { get; set; } = 200;
}
