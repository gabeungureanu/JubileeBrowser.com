namespace JubileeBrowser.Models;

public enum BlockMatchType
{
    Exact,
    Subdomain,
    Keyword,
    Url
}

public class BlockEvent
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Url { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public BlockMatchType MatchType { get; set; }
    public string MatchedPattern { get; set; } = string.Empty;
    public List<string>? SourceCategories { get; set; }
    public BrowserMode BrowserMode { get; set; }
}
