namespace HackerNewsBestStoriesApi.Services;

using HackerNewsBestStoriesApi.Models;

/// <summary>
/// Service interface for retrieving and ranking best Hacker News stories.
/// </summary>
public interface IHackerNewsService
{
    /// <summary>
    /// Retrieves the top n best stories ranked in descending order of score.
    /// </summary>
    /// <param name="n">Number of stories to retrieve.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A read-only collection of story DTOs sorted by score descending.</returns>
    Task<IReadOnlyList<StoryDto>> GetBestStoriesAsync(int n, CancellationToken cancellationToken = default);

    /// <summary>
    /// Proactively warms the in-memory cache with the latest best story IDs and story details.
    /// Used by background workers to prevent cold-start latency for API callers.
    /// </summary>
    Task WarmUpCacheAsync(CancellationToken cancellationToken = default);
}
