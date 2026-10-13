namespace HackerNewsBestStoriesApi.Controllers;

using HackerNewsBestStoriesApi.Models;
using HackerNewsBestStoriesApi.Options;
using HackerNewsBestStoriesApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

/// <summary>
/// RESTful Controller providing endpoints for querying Hacker News stories.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class StoriesController : ControllerBase
{
    private readonly IHackerNewsService _hackerNewsService;
    private readonly HackerNewsOptions _options;
    private readonly ILogger<StoriesController> _logger;

    public StoriesController(
        IHackerNewsService hackerNewsService,
        IOptions<HackerNewsOptions> options,
        ILogger<StoriesController> logger)
    {
        _hackerNewsService = hackerNewsService ?? throw new ArgumentNullException(nameof(hackerNewsService));
        _options = options?.Value ?? new HackerNewsOptions();
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Retrieves the details of the best n stories from Hacker News, ranked by score descending.
    /// </summary>
    /// <param name="n">The number of best stories to retrieve (must be between 1 and configured max, default 200).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <response code="200">Returns the array of best stories sorted by score descending.</response>
    /// <response code="400">If the parameter 'n' is less than 1 or exceeds maximum limit.</response>
    /// <response code="500">If an unhandled server error occurs.</response>
    [HttpGet("best")]
    [HttpGet("/api/beststories")]
    [ProducesResponseType(typeof(IEnumerable<StoryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetBestStories(
        [FromQuery] int n = 10,
        CancellationToken cancellationToken = default)
    {
        if (n <= 0)
        {
            _logger.LogWarning("Invalid parameter n: {N}. Must be greater than 0.", n);
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid request parameter",
                Detail = "The query parameter 'n' must be a positive integer greater than 0.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        if (n > _options.MaxStoryLimit)
        {
            _logger.LogWarning("Requested n: {N} exceeds maximum limit of {Max}.", n, _options.MaxStoryLimit);
            return BadRequest(new ProblemDetails
            {
                Title = "Parameter exceeds maximum allowable value",
                Detail = $"The query parameter 'n' cannot exceed {_options.MaxStoryLimit}.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var stories = await _hackerNewsService.GetBestStoriesAsync(n, cancellationToken);
        return Ok(stories);
    }
}
