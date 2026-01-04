using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Services;

/// <summary>
/// Redis Pub/Sub based event bus for internal messaging across backend modules.
/// Enables decoupled communication between services.
/// </summary>
public interface IEventBusService
{
    Task PublishAsync(string eventType, object? data = null, string? entityId = null, string? entityType = null);
    Task SubscribeAsync(string eventType, Func<PubSubMessage, Task> handler);
    Task SubscribeAllAsync(Func<PubSubMessage, Task> handler);
}

public class EventBusService : IEventBusService, IDisposable
{
    private readonly IRedisCacheService _cache;
    private readonly ILogger<EventBusService> _logger;
    private readonly string _serviceName;
    private readonly List<Func<PubSubMessage, Task>> _globalHandlers = new();
    private readonly Dictionary<string, List<Func<PubSubMessage, Task>>> _handlers = new();

    public EventBusService(
        IRedisCacheService cache,
        IConfiguration configuration,
        ILogger<EventBusService> logger)
    {
        _cache = cache;
        _logger = logger;
        _serviceName = configuration["ServiceName"] ?? "JubileeBrowser.API";
    }

    /// <summary>
    /// Publishes an event to the message bus.
    /// </summary>
    public async Task PublishAsync(string eventType, object? data = null, string? entityId = null, string? entityType = null)
    {
        var message = new PubSubMessage
        {
            EventType = eventType,
            EntityId = entityId,
            EntityType = entityType,
            Data = data != null ? ConvertToDict(data) : null,
            Timestamp = DateTime.UtcNow,
            SourceService = _serviceName
        };

        await _cache.PublishAsync("events", message);
        _logger.LogDebug("Published event: {EventType} for {EntityType}:{EntityId}",
            eventType, entityType, entityId);
    }

    /// <summary>
    /// Subscribes to a specific event type.
    /// </summary>
    public async Task SubscribeAsync(string eventType, Func<PubSubMessage, Task> handler)
    {
        if (!_handlers.ContainsKey(eventType))
        {
            _handlers[eventType] = new List<Func<PubSubMessage, Task>>();
        }
        _handlers[eventType].Add(handler);

        // Ensure we're subscribed to the main channel
        await EnsureSubscribedAsync();
        _logger.LogInformation("Subscribed to event type: {EventType}", eventType);
    }

    /// <summary>
    /// Subscribes to all events.
    /// </summary>
    public async Task SubscribeAllAsync(Func<PubSubMessage, Task> handler)
    {
        _globalHandlers.Add(handler);
        await EnsureSubscribedAsync();
        _logger.LogInformation("Subscribed to all events");
    }

    private bool _isSubscribed = false;
    private readonly SemaphoreSlim _subscribeLock = new(1, 1);

    private async Task EnsureSubscribedAsync()
    {
        if (_isSubscribed) return;

        await _subscribeLock.WaitAsync();
        try
        {
            if (_isSubscribed) return;

            await _cache.SubscribeAsync("events", async msg =>
            {
                // Call global handlers
                foreach (var handler in _globalHandlers)
                {
                    try
                    {
                        await handler(msg);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error in global event handler for {EventType}", msg.EventType);
                    }
                }

                // Call specific handlers
                if (_handlers.TryGetValue(msg.EventType, out var handlers))
                {
                    foreach (var handler in handlers)
                    {
                        try
                        {
                            await handler(msg);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error in event handler for {EventType}", msg.EventType);
                        }
                    }
                }
            });

            _isSubscribed = true;
        }
        finally
        {
            _subscribeLock.Release();
        }
    }

    private static Dictionary<string, object>? ConvertToDict(object obj)
    {
        if (obj is Dictionary<string, object> dict)
        {
            return dict;
        }

        var result = new Dictionary<string, object>();
        foreach (var prop in obj.GetType().GetProperties())
        {
            var value = prop.GetValue(obj);
            if (value != null)
            {
                result[prop.Name] = value;
            }
        }
        return result.Count > 0 ? result : null;
    }

    public void Dispose()
    {
        _subscribeLock.Dispose();
    }
}

/// <summary>
/// Event bus initialization service that sets up standard event handlers.
/// </summary>
public class EventBusInitializationService : IHostedService
{
    private readonly IEventBusService _eventBus;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EventBusInitializationService> _logger;

    public EventBusInitializationService(
        IEventBusService eventBus,
        IServiceScopeFactory scopeFactory,
        ILogger<EventBusInitializationService> logger)
    {
        _eventBus = eventBus;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Subscribe to cache invalidation events
        await _eventBus.SubscribeAsync(EventTypes.DnsUpdated, async msg =>
        {
            _logger.LogInformation("DNS updated event received: {EntityId}", msg.EntityId);
            using var scope = _scopeFactory.CreateScope();
            var dnsService = scope.ServiceProvider.GetRequiredService<IDnsResolutionService>();
            await dnsService.InvalidateCacheAsync(privateUrl: msg.EntityId);
        });

        await _eventBus.SubscribeAsync(EventTypes.DnsDeleted, async msg =>
        {
            _logger.LogInformation("DNS deleted event received: {EntityId}", msg.EntityId);
            using var scope = _scopeFactory.CreateScope();
            var dnsService = scope.ServiceProvider.GetRequiredService<IDnsResolutionService>();
            await dnsService.InvalidateCacheAsync(privateUrl: msg.EntityId);
        });

        // Subscribe to user events for session management
        await _eventBus.SubscribeAsync(EventTypes.UserLoggedOut, async msg =>
        {
            _logger.LogInformation("User logged out event received: {EntityId}", msg.EntityId);
            if (Guid.TryParse(msg.EntityId, out var userId))
            {
                using var scope = _scopeFactory.CreateScope();
                var cache = scope.ServiceProvider.GetRequiredService<IRedisCacheService>();
                await cache.RemoveAsync(CacheKeys.UserSession(userId));
                await cache.RemoveAsync(CacheKeys.UserPermissions(userId));
            }
        });

        // Log all events in debug mode
        await _eventBus.SubscribeAllAsync(async msg =>
        {
            _logger.LogDebug("Event received: {EventType} from {Source} at {Timestamp}",
                msg.EventType, msg.SourceService, msg.Timestamp);
            await Task.CompletedTask;
        });

        _logger.LogInformation("Event bus initialized with standard handlers");
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
