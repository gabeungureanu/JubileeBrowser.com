using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using StackExchange.Redis;
using Serilog;
using JubileeBrowser.API.Services;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/jubilee-api-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Configure Swagger with JWT support
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Jubilee Browser API",
        Version = "v1",
        Description = "Backend API for Jubilee Browser with SSO, DNS resolution, and analytics"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Enter 'Bearer' [space] and then your token.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// Configure JWT Authentication
var jwtSecretKey = builder.Configuration["Jwt:SecretKey"]
    ?? throw new InvalidOperationException("JWT SecretKey not configured");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "JubileeBrowser.API";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "JubileeBrowser.Client";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
        ClockSkew = TimeSpan.Zero
    };

    options.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            Log.Warning("JWT authentication failed: {Message}", context.Exception.Message);
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// Configure Redis
var redisEnabled = builder.Configuration.GetValue<bool>("Redis:Enabled", true);
if (redisEnabled)
{
    var redisConnectionString = builder.Configuration.GetConnectionString("Redis")
        ?? "localhost:6379,abortConnect=false";

    builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
    {
        var configuration = ConfigurationOptions.Parse(redisConnectionString);
        configuration.AbortOnConnectFail = false;
        configuration.ConnectRetry = 3;
        configuration.ConnectTimeout = 5000;
        configuration.SyncTimeout = 5000;

        Log.Information("Connecting to Redis: {Endpoint}", configuration.EndPoints.FirstOrDefault());
        return ConnectionMultiplexer.Connect(configuration);
    });

    builder.Services.AddSingleton<IRedisCacheService, RedisCacheService>();
}
else
{
    // Use a no-op cache service if Redis is disabled
    Log.Warning("Redis is disabled. Caching will not be available.");
    builder.Services.AddSingleton<IRedisCacheService, NoOpCacheService>();
}

// Register application services
builder.Services.AddScoped<IDnsResolutionService, DnsResolutionService>();
builder.Services.AddScoped<IAnalyticsBatchingService, AnalyticsBatchingService>();
builder.Services.AddScoped<IJwtAuthenticationService, JwtAuthenticationService>();
builder.Services.AddSingleton<IEventBusService, EventBusService>();

// Configure Email service
builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Email"));
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddScoped<IEmailService, EmailService>();

// Register background services
builder.Services.AddHostedService<AnalyticsFlushBackgroundService>();
builder.Services.AddHostedService<EventBusInitializationService>();

// Configure CORS for browser access
builder.Services.AddCors(options =>
{
    options.AddPolicy("JubileeBrowser", policy =>
    {
        policy.AllowAnyOrigin() // In production, restrict to specific origins
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Configure rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(
        httpContext =>
        {
            var permitLimit = builder.Configuration.GetValue<int>("RateLimiting:PermitLimit", 100);
            var windowSeconds = builder.Configuration.GetValue<int>("RateLimiting:WindowSeconds", 60);
            var queueLimit = builder.Configuration.GetValue<int>("RateLimiting:QueueLimit", 10);

            return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
                partition => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                {
                    PermitLimit = permitLimit,
                    Window = TimeSpan.FromSeconds(windowSeconds),
                    QueueLimit = queueLimit,
                    QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst
                });
        });

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Jubilee Browser API v1");
    });
}

app.UseHttpsRedirection();
app.UseCors("JubileeBrowser");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Log startup
Log.Information("Jubilee Browser API starting on {Urls}", string.Join(", ", app.Urls));

try
{
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

/// <summary>
/// No-op cache service for when Redis is disabled.
/// </summary>
public class NoOpCacheService : IRedisCacheService
{
    public Task<T?> GetAsync<T>(string key) where T : class => Task.FromResult<T?>(null);
    public Task<bool> SetAsync<T>(string key, T value, TimeSpan? expiry = null) where T : class => Task.FromResult(true);
    public Task<bool> RemoveAsync(string key) => Task.FromResult(true);
    public Task<bool> ExistsAsync(string key) => Task.FromResult(false);
    public Task<bool> SetExpiryAsync(string key, TimeSpan expiry) => Task.FromResult(true);
    public Task<T?> GetOrSetAsync<T>(string key, Func<Task<T?>> factory, TimeSpan? expiry = null) where T : class => factory();
    public Task<long> HashIncrementAsync(string key, string field, long value = 1) => Task.FromResult(value);
    public Task<Dictionary<string, long>> HashGetAllAsync(string key) => Task.FromResult(new Dictionary<string, long>());
    public Task<bool> HashDeleteAsync(string key, string field) => Task.FromResult(true);
    public Task PublishAsync(string channel, JubileeBrowser.Shared.Models.PubSubMessage message) => Task.CompletedTask;
    public Task SubscribeAsync(string channel, Action<JubileeBrowser.Shared.Models.PubSubMessage> handler) => Task.CompletedTask;
    public Task<bool> RemoveByPatternAsync(string pattern) => Task.FromResult(true);
    public Task<long> GetKeyCountAsync(string pattern) => Task.FromResult(0L);
    public Task<bool> IsConnectedAsync() => Task.FromResult(false);
}
