namespace HackerNewsBestStoriesApi.Tests;

using HackerNewsBestStoriesApi.Controllers;
using HackerNewsBestStoriesApi.Models;
using HackerNewsBestStoriesApi.Options;
using HackerNewsBestStoriesApi.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

public class StoriesControllerTests
{
    private readonly Mock<IHackerNewsService> _mockService;
    private readonly Mock<ILogger<StoriesController>> _mockLogger;
    private readonly IOptions<HackerNewsOptions> _options;
    private readonly StoriesController _controller;

    public StoriesControllerTests()
    {
        _mockService = new Mock<IHackerNewsService>();
        _mockLogger = new Mock<ILogger<StoriesController>>();
        _options = Microsoft.Extensions.Options.Options.Create(new HackerNewsOptions
        {
            MaxStoryLimit = 200
        });

        _controller = new StoriesController(_mockService.Object, _options, _mockLogger.Object);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-100)]
    public async Task GetBestStories_ReturnsBadRequest_WhenNIsZeroOrNegative(int invalidN)
    {
        // Act
        var result = await _controller.GetBestStories(invalidN);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var problemDetails = Assert.IsType<ProblemDetails>(badRequestResult.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, problemDetails.Status);
        Assert.Contains("positive integer", problemDetails.Detail);
    }

    [Fact]
    public async Task GetBestStories_ReturnsBadRequest_WhenNExceedsMaxLimit()
    {
        // Act
        var result = await _controller.GetBestStories(201);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        var problemDetails = Assert.IsType<ProblemDetails>(badRequestResult.Value);
        Assert.Equal(StatusCodes.Status400BadRequest, problemDetails.Status);
        Assert.Contains("cannot exceed 200", problemDetails.Detail);
    }

    [Fact]
    public async Task GetBestStories_ReturnsOkWithStories_WhenNIsValid()
    {
        // Arrange
        var sampleStories = new List<StoryDto>
        {
            new()
            {
                Title = "Story Alpha",
                Uri = "https://example.com/alpha",
                PostedBy = "dev1",
                Time = "2024-01-01T12:00:00+00:00",
                Score = 500,
                CommentCount = 120
            },
            new()
            {
                Title = "Story Beta",
                Uri = "https://example.com/beta",
                PostedBy = "dev2",
                Time = "2024-01-01T11:00:00+00:00",
                Score = 250,
                CommentCount = 45
            }
        };

        _mockService
            .Setup(s => s.GetBestStoriesAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(sampleStories);

        // Act
        var result = await _controller.GetBestStories(2);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var returnedStories = Assert.IsAssignableFrom<IEnumerable<StoryDto>>(okResult.Value);
        Assert.Equal(2, returnedStories.Count());
        Assert.Equal("Story Alpha", returnedStories.First().Title);
        Assert.Equal(500, returnedStories.First().Score);
    }
}
