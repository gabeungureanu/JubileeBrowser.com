using Newtonsoft.Json;

namespace JubileeBrowser.Services;

/// <summary>
/// Manages per-domain zoom level settings, persisting user's preferred zoom
/// for each website so it can be restored on subsequent visits.
/// </summary>
public class ZoomSettingsManager
{
    private readonly string _settingsPath;
    private Dictionary<string, double> _zoomLevels = new();
    private readonly object _lock = new();
    private bool _isDirty = false;
    private DateTime _lastSaveTime = DateTime.MinValue;
    private static readonly TimeSpan SaveDebounceInterval = TimeSpan.FromSeconds(2);

    public ZoomSettingsManager()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);
        _settingsPath = Path.Combine(appDataPath, "zoom-settings.json");
    }

    /// <summary>
    /// Loads zoom settings from disk.
    /// </summary>
    public async Task LoadAsync()
    {
        try
        {
            if (File.Exists(_settingsPath))
            {
                var json = await File.ReadAllTextAsync(_settingsPath);
                var loaded = JsonConvert.DeserializeObject<Dictionary<string, double>>(json);
                if (loaded != null)
                {
                    lock (_lock)
                    {
                        _zoomLevels = loaded;
                    }
                }
            }
            System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Loaded {_zoomLevels.Count} zoom settings");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Error loading settings: {ex.Message}");
            _zoomLevels = new Dictionary<string, double>();
        }
    }

    /// <summary>
    /// Saves zoom settings to disk if there are pending changes.
    /// Uses debouncing to avoid excessive disk writes.
    /// </summary>
    public async Task SaveAsync(bool force = false)
    {
        if (!_isDirty && !force) return;

        // Debounce saves
        if (!force && DateTime.UtcNow - _lastSaveTime < SaveDebounceInterval) return;

        try
        {
            Dictionary<string, double> toSave;
            lock (_lock)
            {
                toSave = new Dictionary<string, double>(_zoomLevels);
                _isDirty = false;
            }

            var json = JsonConvert.SerializeObject(toSave, Formatting.Indented);
            await File.WriteAllTextAsync(_settingsPath, json);
            _lastSaveTime = DateTime.UtcNow;
            System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Saved {toSave.Count} zoom settings");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Error saving settings: {ex.Message}");
        }
    }

    /// <summary>
    /// Gets the stored zoom level for a given URL.
    /// Returns null if no custom zoom level is set for this domain.
    /// </summary>
    /// <param name="url">The URL to get the zoom level for</param>
    /// <returns>The zoom level (100 = 100%), or null if not set</returns>
    public double? GetZoomLevel(string? url)
    {
        if (string.IsNullOrEmpty(url)) return null;

        var domain = ExtractDomain(url);
        if (string.IsNullOrEmpty(domain)) return null;

        lock (_lock)
        {
            if (_zoomLevels.TryGetValue(domain, out var zoomLevel))
            {
                System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Retrieved zoom {zoomLevel}% for {domain}");
                return zoomLevel;
            }
        }

        return null;
    }

    /// <summary>
    /// Sets the zoom level for a given URL's domain.
    /// If zoom is 100%, the entry is removed (default zoom).
    /// </summary>
    /// <param name="url">The URL to set the zoom level for</param>
    /// <param name="zoomLevel">The zoom level (100 = 100%)</param>
    public void SetZoomLevel(string? url, double zoomLevel)
    {
        if (string.IsNullOrEmpty(url)) return;

        var domain = ExtractDomain(url);
        if (string.IsNullOrEmpty(domain)) return;

        lock (_lock)
        {
            // If zoom is essentially 100%, remove the custom setting
            if (Math.Abs(zoomLevel - 100) < 0.1)
            {
                if (_zoomLevels.Remove(domain))
                {
                    _isDirty = true;
                    System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Removed zoom setting for {domain} (reset to 100%)");
                }
            }
            else
            {
                _zoomLevels[domain] = zoomLevel;
                _isDirty = true;
                System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Set zoom {zoomLevel}% for {domain}");
            }
        }

        // Trigger a background save (debounced)
        _ = SaveAsync();
    }

    /// <summary>
    /// Extracts the domain from a URL for use as a key.
    /// Handles both regular URLs and custom schemes (inspire://, webspace://).
    /// </summary>
    private static string? ExtractDomain(string url)
    {
        try
        {
            // Handle custom schemes
            if (url.StartsWith("inspire://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("webspace://", StringComparison.OrdinalIgnoreCase))
            {
                // Extract domain from custom scheme URL
                var schemeEnd = url.IndexOf("://");
                if (schemeEnd > 0 && url.Length > schemeEnd + 3)
                {
                    var hostStart = schemeEnd + 3;
                    var hostEnd = url.IndexOf('/', hostStart);
                    if (hostEnd < 0) hostEnd = url.Length;

                    var host = url.Substring(hostStart, hostEnd - hostStart);
                    // Remove port if present
                    var portIndex = host.IndexOf(':');
                    if (portIndex > 0) host = host.Substring(0, portIndex);

                    return host.ToLowerInvariant();
                }
                return null;
            }

            // Handle standard URLs
            if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                return uri.Host.ToLowerInvariant();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"ZoomSettingsManager: Error extracting domain from {url}: {ex.Message}");
        }

        return null;
    }

    /// <summary>
    /// Forces an immediate save of all pending changes.
    /// Call this when the application is closing.
    /// </summary>
    public async Task FlushAsync()
    {
        await SaveAsync(force: true);
    }
}
