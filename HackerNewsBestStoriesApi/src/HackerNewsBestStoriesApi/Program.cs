using HackerNewsBestStoriesApi.BackgroundServices;
using HackerNewsBestStoriesApi.Options;
using HackerNewsBestStoriesApi.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.OpenApi.Models;
using Polly;
using Polly.Extensions.Http;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// 1. Add Configuration Options
builder.Services.Configure<HackerNewsOptions>(
    builder.Configuration.GetSection(HackerNewsOptions.SectionName));

var hnOptions = builder.Configuration
    .GetSection(HackerNewsOptions.SectionName)
    .Get<HackerNewsOptions>() ?? new HackerNewsOptions();

// 2. Add Caching
builder.Services.AddMemoryCache();

// 3. Configure Named HttpClient with Polly Resilience Policies (Retry + Circuit Breaker + Timeout)
builder.Services.AddHttpClient<HackerNewsService>(client =>
{
    client.BaseAddress = new Uri(hnOptions.BaseUrl);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
    client.Timeout = TimeSpan.FromSeconds(15);
})
.AddPolicyHandler(GetRetryPolicy())
.AddPolicyHandler(GetCircuitBreakerPolicy());

// Register HackerNewsService as a Singleton so SemaphoreSlim and in-flight request coalescing
// are process-wide singletons shared across all concurrent requests.
builder.Services.AddSingleton<IHackerNewsService>(sp => sp.GetRequiredService<HackerNewsService>());

// 4. Register Background Cache Refresher Service
builder.Services.AddHostedService<StoryCacheBackgroundRefresher>();

// 5. Add Concurrency & Rate Limiting Middleware
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("fixed", limiterOptions =>
    {
        limiterOptions.PermitLimit = 100;
        limiterOptions.Window = TimeSpan.FromSeconds(1);
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = 50;
    });
});

// 6. Add API Controllers & Swagger OpenAPI Documentation
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Hacker News Best Stories API",
        Version = "v1",
        Description = "A high-performance RESTful API to retrieve and rank the best n Hacker News stories with caching and overload protection.",
        Contact = new OpenApiContact
        {
            Name = "API Engineering Team"
        }
    });

    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
    if (File.Exists(xmlPath))
    {
        c.IncludeXmlComments(xmlPath);
    }
});

// 7. Add Health Checks
builder.Services.AddHealthChecks();

// 8. Add CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

// Configure HTTP Request Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Hacker News Best Stories API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();

app.UseAuthorization();

app.MapControllers().RequireRateLimiting("fixed");
app.MapHealthChecks("/health");

app.Run();

// Resilience Policies
static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy()
{
    // Transient error handling: 5xx, 408, or network failure with jittered backoff
    return HttpPolicyExtensions
        .HandleTransientHttpError()
        .WaitAndRetryAsync(
            3,
            retryAttempt => TimeSpan.FromMilliseconds(200 * Math.Pow(2, retryAttempt))
                          + TimeSpan.FromMilliseconds(Random.Shared.Next(0, 100)));
}

static IAsyncPolicy<HttpResponseMessage> GetCircuitBreakerPolicy()
{
    // Break circuit if 5 consecutive failures occur within 30 seconds
    return HttpPolicyExtensions
        .HandleTransientHttpError()
        .CircuitBreakerAsync(5, TimeSpan.FromSeconds(30));
}

// Partial program class for WebApplicationFactory tests
public partial class Program { }
