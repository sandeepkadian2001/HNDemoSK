namespace HackerNewsBestStoriesApi.Models;

using System.Text.Json.Serialization;

/// <summary>
/// Data Transfer Object representing a Hacker News story in the exact format required by the specification.
/// </summary>
public record StoryDto
{
    /// <summary>
    /// The title of the story.
    /// </summary>
    [JsonPropertyName("title")]
    public required string Title { get; init; }

    /// <summary>
    /// The URL of the story. If the story has no external URL (e.g. Ask HN), falls back to the Hacker News item URL.
    /// </summary>
    [JsonPropertyName("uri")]
    public required string Uri { get; init; }

    /// <summary>
    /// The username of the user who submitted the story.
    /// </summary>
    [JsonPropertyName("postedBy")]
    public required string PostedBy { get; init; }

    /// <summary>
    /// The time the story was submitted in ISO 8601 format with UTC offset (e.g., 2019-10-12T13:43:01+00:00).
    /// </summary>
    [JsonPropertyName("time")]
    public required string Time { get; init; }

    /// <summary>
    /// The story's score (upvotes).
    /// </summary>
    [JsonPropertyName("score")]
    public int Score { get; init; }

    /// <summary>
    /// The total number of comments on the story.
    /// </summary>
    [JsonPropertyName("commentCount")]
    public int CommentCount { get; init; }
}
