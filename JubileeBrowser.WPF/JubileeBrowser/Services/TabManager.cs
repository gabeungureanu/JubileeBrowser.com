using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class TabManager
{
    private const int MaxClosedTabs = 25;
    private readonly List<TabState> _closedTabs = new();

    public event EventHandler<TabState>? TabCreated;
    public event EventHandler<string>? TabClosed;
    public event EventHandler<TabState>? TabUpdated;
    public event EventHandler<string?>? ActiveTabChanged;

    public void AddClosedTab(TabState tab)
    {
        _closedTabs.Insert(0, tab);
        if (_closedTabs.Count > MaxClosedTabs)
        {
            _closedTabs.RemoveAt(_closedTabs.Count - 1);
        }
    }

    public TabState? PopClosedTab()
    {
        if (_closedTabs.Count == 0) return null;

        var tab = _closedTabs[0];
        _closedTabs.RemoveAt(0);
        return tab;
    }

    public IReadOnlyList<TabState> GetClosedTabs()
    {
        return _closedTabs.AsReadOnly();
    }

    public void ClearClosedTabs()
    {
        _closedTabs.Clear();
    }

    protected virtual void OnTabCreated(TabState tab)
    {
        TabCreated?.Invoke(this, tab);
    }

    protected virtual void OnTabClosed(string tabId)
    {
        TabClosed?.Invoke(this, tabId);
    }

    protected virtual void OnTabUpdated(TabState tab)
    {
        TabUpdated?.Invoke(this, tab);
    }

    protected virtual void OnActiveTabChanged(string? tabId)
    {
        ActiveTabChanged?.Invoke(this, tabId);
    }
}
