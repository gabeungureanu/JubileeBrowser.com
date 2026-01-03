using Newtonsoft.Json;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class BookmarkManager
{
    private readonly string _bookmarksPath;
    private List<BookmarkEntry> _bookmarks = new();

    public BookmarkManager()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);
        _bookmarksPath = Path.Combine(appDataPath, "bookmarks.json");
    }

    public async Task InitializeAsync()
    {
        await LoadAsync();
    }

    public async Task LoadAsync()
    {
        try
        {
            if (File.Exists(_bookmarksPath))
            {
                var json = await File.ReadAllTextAsync(_bookmarksPath);
                var loaded = JsonConvert.DeserializeObject<List<BookmarkEntry>>(json);
                if (loaded != null)
                {
                    _bookmarks = loaded;
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading bookmarks: {ex.Message}");
            _bookmarks = new List<BookmarkEntry>();
        }
    }

    public async Task SaveAsync()
    {
        try
        {
            var json = JsonConvert.SerializeObject(_bookmarks, Formatting.Indented);
            await File.WriteAllTextAsync(_bookmarksPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving bookmarks: {ex.Message}");
        }
    }

    public void AddBookmark(string url, string title, BrowserMode mode, string? favicon = null, string? folder = null)
    {
        // Check for duplicates
        if (IsBookmarked(url))
            return;

        var bookmark = new BookmarkEntry
        {
            Id = Guid.NewGuid().ToString(),
            Url = url,
            Title = title,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Mode = mode,
            Favicon = favicon,
            Folder = folder
        };

        _bookmarks.Add(bookmark);
        _ = SaveAsync();
    }

    public void RemoveBookmark(string url)
    {
        _bookmarks.RemoveAll(b => b.Url == url);
        _ = SaveAsync();
    }

    public void RemoveBookmarkById(string id)
    {
        _bookmarks.RemoveAll(b => b.Id == id);
        _ = SaveAsync();
    }

    public bool IsBookmarked(string url)
    {
        return _bookmarks.Any(b => b.Url == url);
    }

    public BookmarkEntry? GetBookmark(string url)
    {
        return _bookmarks.FirstOrDefault(b => b.Url == url);
    }

    public IEnumerable<BookmarkEntry> GetBookmarks(BrowserMode? mode = null, string? folder = null)
    {
        var query = _bookmarks.AsEnumerable();

        if (mode.HasValue)
        {
            query = query.Where(b => b.Mode == mode.Value);
        }

        if (folder != null)
        {
            query = query.Where(b => b.Folder == folder);
        }

        return query.OrderByDescending(b => b.CreatedAt).ToList();
    }

    public IEnumerable<string> GetFolders(BrowserMode? mode = null)
    {
        var query = _bookmarks.AsEnumerable();

        if (mode.HasValue)
        {
            query = query.Where(b => b.Mode == mode.Value);
        }

        return query
            .Where(b => !string.IsNullOrEmpty(b.Folder))
            .Select(b => b.Folder!)
            .Distinct()
            .OrderBy(f => f)
            .ToList();
    }

    public async Task UpdateBookmarkAsync(string id, string? title = null, string? folder = null)
    {
        var bookmark = _bookmarks.FirstOrDefault(b => b.Id == id);
        if (bookmark != null)
        {
            if (title != null) bookmark.Title = title;
            if (folder != null) bookmark.Folder = folder;
            await SaveAsync();
        }
    }
}
