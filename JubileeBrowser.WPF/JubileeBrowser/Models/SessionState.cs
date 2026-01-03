namespace JubileeBrowser.Models;

public class WindowBounds
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; } = 1280;
    public double Height { get; set; } = 800;
}

public class MonitorInfo
{
    public string DeviceName { get; set; } = string.Empty;
    public double Left { get; set; }
    public double Top { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public bool IsPrimary { get; set; }
}

public class SessionTabState
{
    public string Id { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public BrowserMode Mode { get; set; } = BrowserMode.Internet;
    public bool IsActive { get; set; }
}

public class SessionState
{
    public WindowBounds WindowBounds { get; set; } = new();
    public bool IsMaximized { get; set; }
    public bool IsMinimized { get; set; }
    public MonitorInfo? LastMonitor { get; set; }
    public BrowserMode CurrentMode { get; set; } = BrowserMode.Internet;
    public List<SessionTabState> Tabs { get; set; } = new();
    public string? ActiveTabId { get; set; }
    public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public bool HasSavedState { get; set; }
}
