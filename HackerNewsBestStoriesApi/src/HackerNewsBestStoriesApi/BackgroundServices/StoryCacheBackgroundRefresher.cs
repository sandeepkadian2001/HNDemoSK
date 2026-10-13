namespace HackerNewsBestStoriesApi.BackgroundServices;

using HackerNewsBestStoriesApi.Options;
using HackerNewsBestStoriesApi.Services;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

/// <summary>
/// Background worker that periodically refreshes the best stories cache
/// to eliminate cold-start latency and avoid synchronous spike queries to Hacker News.
/// </summary>
public class StoryCacheBackgroundRefresher : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly HackerNewsOptions _options;
    private readonly ILogger<StoryCacheBackgroundRefresher> _logger;

    public StoryCacheBackgroundRefresher(
        IServiceProvider serviceProvider,
        IOptions<HackerNewsOptions> options,
        ILogger<StoryCacheBackgroundRefresher> logger)
    {
        _serviceProvider = serviceProvider;
        _options = options?.Value ?? new HackerNewsOptions();
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("StoryCacheBackgroundRefresher started.");

        // Initial warm-up immediately upon application startup
        await WarmUpAsync(stoppingToken);

        int intervalSeconds = Math.Max(15, _options.BackgroundRefreshIntervalSeconds);
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(intervalSeconds));

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            await WarmUpAsync(stoppingToken);
        }

        _logger.LogInformation("StoryCacheBackgroundRefresher stopped.");
    }

    private async Task WarmUpAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IHackerNewsService>();
            await service.WarmUpCacheAsync(cancellationToken);
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogError(ex, "Error occurred during periodic cache refresh.");
        }
    }
}
