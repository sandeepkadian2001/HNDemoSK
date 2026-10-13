namespace HackerNewsBestStoriesApi.Models;

using System.Text.Json.Serialization;

/// <summary>
/// Raw item response model from Hacker News Firebase API (/v0/item/{id}.json).
/// </summary>
public record HackerNewsItem
{
    [JsonPropertyName("id")]
    public int Id { get; init; }

    [JsonPropertyName("deleted")]
    public bool Deleted { get; init; }

    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("by")]
    public string? By { get; init; }

    [JsonPropertyName("time")]
    public long Time { get; init; }

    [JsonPropertyName("text")]
    public string? Text { get; init; }

    [JsonPropertyName("dead")]
    public bool Dead { get; init; }

    [JsonPropertyName("parent")]
    public int? Parent { get; init; }

    [JsonPropertyName("kids")]
    public int[]? Kids { get; init; }

    [JsonPropertyName("url")]
    public string? Url { get; init; }

    [JsonPropertyName("score")]
    public int Score { get; init; }

    [JsonPropertyName("title")]
    public string? Title { get; init; }

    [JsonPropertyName("descendants")]
    public int? Descendants { get; init; }
}
