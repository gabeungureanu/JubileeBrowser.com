namespace JubileeBrowser.Models;

public class BookmarkEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Url { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public BrowserMode Mode { get; set; } = BrowserMode.Internet;
    public string? Folder { get; set; }
    public string? Favicon { get; set; }
}
