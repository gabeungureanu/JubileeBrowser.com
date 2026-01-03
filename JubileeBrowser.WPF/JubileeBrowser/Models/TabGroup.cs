namespace JubileeBrowser.Models;

public enum TabGroupColor
{
    Grey,
    Blue,
    Red,
    Yellow,
    Green,
    Pink,
    Purple,
    Cyan,
    Orange
}

public class TabGroup
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public TabGroupColor Color { get; set; } = TabGroupColor.Grey;
    public List<string> TabIds { get; set; } = new();
    public bool IsCollapsed { get; set; }
}
