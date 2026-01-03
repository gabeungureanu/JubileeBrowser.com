using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace JubileeBrowser.Models;

public class TabState : INotifyPropertyChanged
{
    private string _id = Guid.NewGuid().ToString();
    private string _title = "New Tab";
    private string _url = string.Empty;
    private string? _favicon;
    private bool _isLoading;
    private bool _canGoBack;
    private bool _canGoForward;
    private BrowserMode _mode = BrowserMode.Internet;
    private bool _isSecure;
    private bool _isActive;
    private bool _isPinned;
    private bool _isMuted;
    private bool _isAudible;
    private string? _groupId;

    public event PropertyChangedEventHandler? PropertyChanged;

    protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    public string Id
    {
        get => _id;
        set { if (_id != value) { _id = value; OnPropertyChanged(); } }
    }

    public string Title
    {
        get => _title;
        set { if (_title != value) { _title = value; OnPropertyChanged(); } }
    }

    public string Url
    {
        get => _url;
        set
        {
            if (_url != value)
            {
                _url = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsInspireUrl));
            }
        }
    }

    /// <summary>
    /// Returns true if the URL is an inspire:// protocol URL.
    /// Used for displaying the WWBW icon on WWW mode tabs with inspire:// URLs.
    /// </summary>
    public bool IsInspireUrl => _url?.StartsWith("inspire://", StringComparison.OrdinalIgnoreCase) == true;

    public string? Favicon
    {
        get => _favicon;
        set { if (_favicon != value) { _favicon = value; OnPropertyChanged(); } }
    }

    public bool IsLoading
    {
        get => _isLoading;
        set { if (_isLoading != value) { _isLoading = value; OnPropertyChanged(); } }
    }

    public bool CanGoBack
    {
        get => _canGoBack;
        set { if (_canGoBack != value) { _canGoBack = value; OnPropertyChanged(); } }
    }

    public bool CanGoForward
    {
        get => _canGoForward;
        set { if (_canGoForward != value) { _canGoForward = value; OnPropertyChanged(); } }
    }

    public BrowserMode Mode
    {
        get => _mode;
        set { if (_mode != value) { _mode = value; OnPropertyChanged(); } }
    }

    public bool IsSecure
    {
        get => _isSecure;
        set { if (_isSecure != value) { _isSecure = value; OnPropertyChanged(); } }
    }

    public bool IsActive
    {
        get => _isActive;
        set { if (_isActive != value) { _isActive = value; OnPropertyChanged(); } }
    }

    public bool IsPinned
    {
        get => _isPinned;
        set { if (_isPinned != value) { _isPinned = value; OnPropertyChanged(); } }
    }

    public bool IsMuted
    {
        get => _isMuted;
        set { if (_isMuted != value) { _isMuted = value; OnPropertyChanged(); } }
    }

    public bool IsAudible
    {
        get => _isAudible;
        set { if (_isAudible != value) { _isAudible = value; OnPropertyChanged(); } }
    }

    public string? GroupId
    {
        get => _groupId;
        set { if (_groupId != value) { _groupId = value; OnPropertyChanged(); } }
    }
}
