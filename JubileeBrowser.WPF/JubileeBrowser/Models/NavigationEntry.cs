namespace JubileeBrowser.Models;

public class NavigationEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Url { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public BrowserMode Mode { get; set; } = BrowserMode.Internet;
    public string? Favicon { get; set; }
}
