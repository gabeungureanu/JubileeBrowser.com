using Newtonsoft.Json;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class HistoryManager
{
    private const int MaxEntries = 10000;
    private readonly string _historyPath;
    private List<NavigationEntry> _entries = new();

    public HistoryManager()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);
        _historyPath = Path.Combine(appDataPath, "history.json");
    }

    public async Task InitializeAsync()
    {
        await LoadAsync();
    }

    public async Task LoadAsync()
    {
        try
        {
            if (File.Exists(_historyPath))
            {
                var json = await File.ReadAllTextAsync(_historyPath);
                var loaded = JsonConvert.DeserializeObject<List<NavigationEntry>>(json);
                if (loaded != null)
                {
                    _entries = loaded;
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading history: {ex.Message}");
            _entries = new List<NavigationEntry>();
        }
    }

    public async Task SaveAsync()
    {
        try
        {
            var json = JsonConvert.SerializeObject(_entries, Formatting.Indented);
            await File.WriteAllTextAsync(_historyPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving history: {ex.Message}");
        }
    }

    public void AddEntry(string url, string title, BrowserMode mode, string? favicon = null)
    {
        // Don't add empty URLs or about: pages
        if (string.IsNullOrEmpty(url) || url.StartsWith("about:") || url.StartsWith("jubilee:"))
            return;

        var entry = new NavigationEntry
        {
            Id = Guid.NewGuid().ToString(),
            Url = url,
            Title = title,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Mode = mode,
            Favicon = favicon
        };

        _entries.Insert(0, entry);

        // Trim if over limit
        if (_entries.Count > MaxEntries)
        {
            _entries = _entries.Take(MaxEntries).ToList();
        }

        // Save asynchronously
        _ = SaveAsync();
    }

    public IEnumerable<NavigationEntry> GetEntries(BrowserMode? mode = null, int? limit = null)
    {
        var query = _entries.AsEnumerable();

        if (mode.HasValue)
        {
            query = query.Where(e => e.Mode == mode.Value);
        }

        if (limit.HasValue)
        {
            query = query.Take(limit.Value);
        }

        return query.ToList();
    }

    public IEnumerable<NavigationEntry> Search(string query, BrowserMode? mode = null, int limit = 50)
    {
        var searchQuery = query.ToLowerInvariant();
        var results = _entries
            .Where(e => (mode == null || e.Mode == mode) &&
                       (e.Title.Contains(searchQuery, StringComparison.OrdinalIgnoreCase) ||
                        e.Url.Contains(searchQuery, StringComparison.OrdinalIgnoreCase)))
            .Take(limit);

        return results.ToList();
    }

    public async Task ClearAsync(BrowserMode? mode = null)
    {
        if (mode.HasValue)
        {
            _entries = _entries.Where(e => e.Mode != mode.Value).ToList();
        }
        else
        {
            _entries.Clear();
        }

        await SaveAsync();
    }

    public async Task RemoveEntryAsync(string id)
    {
        _entries.RemoveAll(e => e.Id == id);
        await SaveAsync();
    }
}
