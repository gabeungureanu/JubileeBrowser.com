using System.Collections.ObjectModel;
using System.Runtime.InteropServices;
using System.Web;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using JubileeBrowser.Models;
using JubileeBrowser.Services;

namespace JubileeBrowser;

public partial class MainWindow : Window
{
    private readonly TabManager _tabManager;
    private readonly HistoryManager _historyManager;
    private readonly BookmarkManager _bookmarkManager;
    private readonly SettingsManager _settingsManager;
    private readonly SessionStateManager _sessionStateManager;
    private readonly BlacklistManager _blacklistManager;
    private readonly WWBWDnsResolver _dnsResolver;
    private readonly HitCountService _hitCountService;
    private readonly ZoomSettingsManager _zoomSettingsManager;

    private readonly Dictionary<string, WebView2> _webViews = new();
    private BrowserMode _currentMode = BrowserMode.Internet;
    private string? _activeTabId;
    private bool _isInitialized;
    private bool _isFullScreen;
    private WindowState _preFullScreenState = WindowState.Normal;
    private Rect _preFullScreenBounds;

    // For tracking window bounds when maximized (to save restore position)
    private Rect _restoreBounds;
    private bool _hasRestoredWindowState;

    // Zoom level tracking (100 = 100%, range: 25-500)
    private double _currentZoomLevel = 100;
    private const double ZoomStep = 10;
    private const double MinZoom = 25;
    private const double MaxZoom = 500;

    // Tab drag-drop tracking
    private Point _dragStartPoint;
    private bool _isDragging;
    private TabState? _draggedTab;

    public ObservableCollection<TabState> Tabs { get; } = new();

    // Win32 interop for proper maximize behavior
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll")]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("user32.dll")]
    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

    private delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private const int WM_GETMINMAXINFO = 0x0024;
    private const int WM_NCHITTEST = 0x0084;
    private const int WM_NCCALCSIZE = 0x0083;
    private const int WM_NCACTIVATE = 0x0086;
    private const int WM_NCPAINT = 0x0085;
    private const int WM_SYSCOMMAND = 0x0112;
    private const uint MONITOR_DEFAULTTONEAREST = 0x00000002;

    // Hit test results for resize
    private const int HTLEFT = 10;
    private const int HTRIGHT = 11;
    private const int HTTOP = 12;
    private const int HTTOPLEFT = 13;
    private const int HTTOPRIGHT = 14;
    private const int HTBOTTOM = 15;
    private const int HTBOTTOMLEFT = 16;
    private const int HTBOTTOMRIGHT = 17;
    private const int HTCLIENT = 1;

    // Resize directions for WM_SYSCOMMAND
    private const int SC_SIZE_LEFT = 0xF001;
    private const int SC_SIZE_RIGHT = 0xF002;
    private const int SC_SIZE_TOP = 0xF003;
    private const int SC_SIZE_TOPLEFT = 0xF004;
    private const int SC_SIZE_TOPRIGHT = 0xF005;
    private const int SC_SIZE_BOTTOM = 0xF006;
    private const int SC_SIZE_BOTTOMLEFT = 0xF007;
    private const int SC_SIZE_BOTTOMRIGHT = 0xF008;

    private const int ResizeBorderWidth = 3;

    public MainWindow()
    {
        InitializeComponent();

        // Initialize managers
        _settingsManager = new SettingsManager();
        _historyManager = new HistoryManager();
        _bookmarkManager = new BookmarkManager();
        _sessionStateManager = new SessionStateManager();
        _blacklistManager = new BlacklistManager();
        _dnsResolver = new WWBWDnsResolver();
        _hitCountService = new HitCountService();
        _zoomSettingsManager = new ZoomSettingsManager();
        _tabManager = new TabManager();

        // Bind tabs to UI
        TabStrip.ItemsSource = Tabs;

        // Subscribe to tab manager events
        _tabManager.TabCreated += OnTabCreated;
        _tabManager.TabClosed += OnTabClosed;
        _tabManager.TabUpdated += OnTabUpdated;
        _tabManager.ActiveTabChanged += OnActiveTabChanged;

        // Hook into SourceInitialized to set up window message handling
        SourceInitialized += MainWindow_SourceInitialized;
    }

    private void MainWindow_SourceInitialized(object? sender, EventArgs e)
    {
        // Add hook for WM_GETMINMAXINFO to handle maximize properly with WindowStyle=None
        var handle = new WindowInteropHelper(this).Handle;
        var source = HwndSource.FromHwnd(handle);
        source?.AddHook(WindowProc);
    }

    private IntPtr WindowProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_NCCALCSIZE && wParam != IntPtr.Zero)
        {
            // Remove the standard window frame/border by returning 0
            // This eliminates the thin white/gray border that appears with WindowStyle=None
            handled = true;
            return IntPtr.Zero;
        }
        else if (msg == WM_NCACTIVATE)
        {
            // Prevent Windows from drawing the inactive/active window frame
            // Return TRUE (1) to indicate we handled it, preventing default frame drawing
            // This fixes the white border that appears when the window loses focus
            handled = true;
            return new IntPtr(1);
        }
        else if (msg == WM_NCPAINT)
        {
            // Prevent Windows from painting the non-client area (frame)
            // This prevents any border from being drawn during paint operations
            handled = true;
            return IntPtr.Zero;
        }
        else if (msg == WM_GETMINMAXINFO && !_isFullScreen)
        {
            // Handle maximize to respect taskbar and work area (skip in fullscreen mode)
            WmGetMinMaxInfo(hwnd, lParam);
            handled = true;
        }
        else if (msg == WM_NCHITTEST && WindowState == WindowState.Normal && !_isFullScreen)
        {
            // Custom hit testing for resize borders
            var result = HitTestForResize(lParam);
            if (result != HTCLIENT)
            {
                handled = true;
                return new IntPtr(result);
            }
        }
        return IntPtr.Zero;
    }

    private int HitTestForResize(IntPtr lParam)
    {
        // Get mouse position in screen coordinates (physical pixels)
        int screenX = (short)(lParam.ToInt32() & 0xFFFF);
        int screenY = (short)((lParam.ToInt32() >> 16) & 0xFFFF);

        // Get window rectangle in screen coordinates (physical pixels)
        var hwnd = new WindowInteropHelper(this).Handle;
        if (!GetWindowRect(hwnd, out RECT windowRect))
            return HTCLIENT;

        // Calculate position relative to window in physical pixels
        int x = screenX - windowRect.Left;
        int y = screenY - windowRect.Top;
        int width = windowRect.Right - windowRect.Left;
        int height = windowRect.Bottom - windowRect.Top;

        // Use a generous border width in physical pixels
        int borderWidth = ResizeBorderWidth;

        // Check corners first (they have priority)
        bool left = x < borderWidth;
        bool right = x > width - borderWidth;
        bool top = y < borderWidth;
        bool bottom = y > height - borderWidth;

        if (top && left) return HTTOPLEFT;
        if (top && right) return HTTOPRIGHT;
        if (bottom && left) return HTBOTTOMLEFT;
        if (bottom && right) return HTBOTTOMRIGHT;
        if (left) return HTLEFT;
        if (right) return HTRIGHT;
        if (top) return HTTOP;
        if (bottom) return HTBOTTOM;

        return HTCLIENT;
    }

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out RECT lpRect);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    private void ResizeBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (WindowState != WindowState.Normal || _isFullScreen)
            return;

        var element = sender as FrameworkElement;
        if (element?.Tag == null) return;

        int direction;
        switch (element.Tag.ToString())
        {
            case "Left": direction = SC_SIZE_LEFT; break;
            case "Right": direction = SC_SIZE_RIGHT; break;
            case "Top": direction = SC_SIZE_TOP; break;
            case "TopLeft": direction = SC_SIZE_TOPLEFT; break;
            case "TopRight": direction = SC_SIZE_TOPRIGHT; break;
            case "Bottom": direction = SC_SIZE_BOTTOM; break;
            case "BottomLeft": direction = SC_SIZE_BOTTOMLEFT; break;
            case "BottomRight": direction = SC_SIZE_BOTTOMRIGHT; break;
            default: return;
        }

        var hwnd = new WindowInteropHelper(this).Handle;
        SendMessage(hwnd, WM_SYSCOMMAND, (IntPtr)direction, IntPtr.Zero);
    }

    private void WmGetMinMaxInfo(IntPtr hwnd, IntPtr lParam)
    {
        var mmi = Marshal.PtrToStructure<MINMAXINFO>(lParam);

        var monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if (monitor != IntPtr.Zero)
        {
            var monitorInfo = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (GetMonitorInfo(monitor, ref monitorInfo))
            {
                var rcWork = monitorInfo.rcWork;
                var rcMonitor = monitorInfo.rcMonitor;

                // Set max position to work area (respects taskbar)
                mmi.ptMaxPosition.X = Math.Abs(rcWork.Left - rcMonitor.Left);
                mmi.ptMaxPosition.Y = Math.Abs(rcWork.Top - rcMonitor.Top);

                // Set max size to work area size
                mmi.ptMaxSize.X = Math.Abs(rcWork.Right - rcWork.Left);
                mmi.ptMaxSize.Y = Math.Abs(rcWork.Bottom - rcWork.Top);

                // Set max tracking size
                mmi.ptMaxTrackSize.X = mmi.ptMaxSize.X;
                mmi.ptMaxTrackSize.Y = mmi.ptMaxSize.Y;
            }
        }

        Marshal.StructureToPtr(mmi, lParam, true);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Initialize managers
            await _settingsManager.InitializeAsync();
            await _historyManager.InitializeAsync();
            await _bookmarkManager.InitializeAsync();
            await _blacklistManager.InitializeAsync();
            await _dnsResolver.InitializeAsync();
            await _hitCountService.InitializeAsync();
            await _zoomSettingsManager.LoadAsync();

            // Apply settings
            var settings = _settingsManager.Settings;
            _currentMode = settings?.DefaultMode ?? BrowserMode.Internet;
            UpdateModeRadioButtons();

            // Apply initial mode visuals
            UpdateModeVisuals();

            // Restore session or create new tab
            var sessionState = await _sessionStateManager.LoadAsync();

            // Restore window position and size
            RestoreWindowState(sessionState);

            if (sessionState != null && sessionState.Tabs != null && sessionState.Tabs.Count > 0)
            {
                // Restore mode from session
                _currentMode = sessionState.CurrentMode;
                UpdateModeRadioButtons();
                UpdateModeVisuals();

                // Restore tabs
                foreach (var tabState in sessionState.Tabs)
                {
                    await CreateTabAsync(tabState.Url, tabState.Mode);
                }

                // Switch to active tab
                if (!string.IsNullOrEmpty(sessionState.ActiveTabId))
                {
                    var activeTab = Tabs.FirstOrDefault(t => t.Id == sessionState.ActiveTabId);
                    if (activeTab != null)
                    {
                        SwitchToTab(activeTab.Id);
                    }
                }
            }
            else
            {
                // Create initial tab
                await CreateTabAsync(GetHomepage());
            }

            _isInitialized = true;
            _hasRestoredWindowState = true;
            UpdateWelcomePanel();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error during initialization: {ex.Message}");
            // Try to recover by creating a default tab
            try
            {
                await CreateTabAsync("about:blank");
                _isInitialized = true;
                _hasRestoredWindowState = true;
                UpdateWelcomePanel();
            }
            catch
            {
                // Last resort - just mark as initialized
                _isInitialized = true;
                _hasRestoredWindowState = true;
            }
        }
    }

    private void RestoreWindowState(SessionState? sessionState)
    {
        // If no saved state or first launch, center on primary screen
        if (sessionState == null || !sessionState.HasSavedState)
        {
            CenterWindowOnPrimaryScreen();
            return;
        }

        var bounds = sessionState.WindowBounds;

        // Validate that the saved position is still on a valid monitor
        if (IsPositionOnValidMonitor(bounds.X, bounds.Y, bounds.Width, bounds.Height))
        {
            // Restore the saved position
            Left = bounds.X;
            Top = bounds.Y;
            Width = bounds.Width;
            Height = bounds.Height;

            // Store restore bounds before maximizing
            _restoreBounds = new Rect(bounds.X, bounds.Y, bounds.Width, bounds.Height);

            // Restore maximized state after setting position
            if (sessionState.IsMaximized)
            {
                WindowState = WindowState.Maximized;
            }
        }
        else
        {
            // Previous monitor is no longer available, center on primary screen
            CenterWindowOnPrimaryScreen();

            // Still apply maximized state if it was maximized
            if (sessionState.IsMaximized)
            {
                WindowState = WindowState.Maximized;
            }
        }
    }

    private void CenterWindowOnPrimaryScreen()
    {
        // Get the primary screen work area
        var workArea = SystemParameters.WorkArea;

        // Use default size or current size
        var width = Width > 0 ? Width : 1280;
        var height = Height > 0 ? Height : 800;

        // Ensure window fits within work area
        width = Math.Min(width, workArea.Width);
        height = Math.Min(height, workArea.Height);

        // Center the window
        Left = workArea.Left + (workArea.Width - width) / 2;
        Top = workArea.Top + (workArea.Height - height) / 2;
        Width = width;
        Height = height;

        _restoreBounds = new Rect(Left, Top, Width, Height);
    }

    private bool IsPositionOnValidMonitor(double x, double y, double width, double height)
    {
        // Check if at least a portion of the window would be visible on any monitor
        var windowRect = new Rect(x, y, width, height);
        var monitors = GetAllMonitors();

        foreach (var monitor in monitors)
        {
            var monitorRect = new Rect(monitor.Left, monitor.Top, monitor.Width, monitor.Height);

            // Check if window overlaps with this monitor (at least 50 pixels visible)
            var intersection = Rect.Intersect(windowRect, monitorRect);
            if (!intersection.IsEmpty && intersection.Width >= 50 && intersection.Height >= 50)
            {
                return true;
            }
        }

        return false;
    }

    private List<Models.MonitorInfo> GetAllMonitors()
    {
        var monitors = new List<Models.MonitorInfo>();

        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData) =>
        {
            var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (GetMonitorInfo(hMonitor, ref info))
            {
                monitors.Add(new Models.MonitorInfo
                {
                    Left = info.rcWork.Left,
                    Top = info.rcWork.Top,
                    Width = info.rcWork.Right - info.rcWork.Left,
                    Height = info.rcWork.Bottom - info.rcWork.Top,
                    IsPrimary = (info.dwFlags & 1) != 0 // MONITORINFOF_PRIMARY = 1
                });
            }
            return true;
        }, IntPtr.Zero);

        return monitors;
    }

    private Models.MonitorInfo? GetCurrentMonitor()
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return null;

        var hMonitor = MonitorFromWindow(handle, MONITOR_DEFAULTTONEAREST);
        if (hMonitor == IntPtr.Zero) return null;

        var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (!GetMonitorInfo(hMonitor, ref info)) return null;

        return new Models.MonitorInfo
        {
            Left = info.rcWork.Left,
            Top = info.rcWork.Top,
            Width = info.rcWork.Right - info.rcWork.Left,
            Height = info.rcWork.Bottom - info.rcWork.Top,
            IsPrimary = (info.dwFlags & 1) != 0
        };
    }

    private async void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        // Save session state with current window position
        SaveSessionState(true);

        // Save zoom settings
        await _zoomSettingsManager.FlushAsync();

        // Cleanup WebViews
        foreach (var webView in _webViews.Values)
        {
            webView.Dispose();
        }
    }

    private void Window_StateChanged(object sender, EventArgs e)
    {
        // Update maximize button icon
        MaximizeButton.Content = WindowState == WindowState.Maximized ? "\uE923" : "\uE922";

        // Track restore bounds when window is in normal state
        if (_hasRestoredWindowState && WindowState == WindowState.Normal && !_isFullScreen)
        {
            _restoreBounds = new Rect(Left, Top, Width, Height);
        }
    }

    private void Window_LocationChanged(object? sender, EventArgs e)
    {
        // Track position changes when in normal state
        if (_hasRestoredWindowState && WindowState == WindowState.Normal && !_isFullScreen)
        {
            _restoreBounds = new Rect(Left, Top, Width, Height);
        }
    }

    private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        // Track size changes when in normal state
        if (_hasRestoredWindowState && WindowState == WindowState.Normal && !_isFullScreen)
        {
            _restoreBounds = new Rect(Left, Top, Width, Height);
        }
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        // Handle keyboard shortcuts
        if (Keyboard.Modifiers == ModifierKeys.Control)
        {
            switch (e.Key)
            {
                case Key.T:
                    _ = CreateTabAsync(GetHomepage());
                    e.Handled = true;
                    break;
                case Key.W:
                    CloseCurrentTab();
                    e.Handled = true;
                    break;
                case Key.R:
                    ReloadCurrentTab();
                    e.Handled = true;
                    break;
                case Key.F5:
                    // Ctrl+F5 = Deep refresh (bypass cache)
                    DeepRefreshCurrentTab();
                    e.Handled = true;
                    break;
                case Key.L:
                    AddressBar.Focus();
                    AddressBar.SelectAll();
                    e.Handled = true;
                    break;
                case Key.D:
                    BookmarkCurrentPage();
                    e.Handled = true;
                    break;
                case Key.H:
                    ShowHistory();
                    e.Handled = true;
                    break;
                case Key.D0:
                case Key.NumPad0:
                    // Ctrl+0 = Reset zoom
                    ResetZoom();
                    e.Handled = true;
                    break;
            }
        }
        else if (Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
        {
            switch (e.Key)
            {
                case Key.T:
                    ReopenClosedTab();
                    e.Handled = true;
                    break;
                case Key.B:
                    ShowBookmarks();
                    e.Handled = true;
                    break;
            }
        }
        else if (Keyboard.Modifiers == ModifierKeys.Alt)
        {
            switch (e.Key)
            {
                case Key.Left:
                    GoBack();
                    e.Handled = true;
                    break;
                case Key.Right:
                    GoForward();
                    e.Handled = true;
                    break;
            }
        }
        else if (e.Key == Key.F5)
        {
            ReloadCurrentTab();
            e.Handled = true;
        }
        else if (e.Key == Key.F11)
        {
            ToggleFullScreen();
            e.Handled = true;
        }
    }

    private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
    {
        // Ctrl + Mouse Wheel = Zoom
        if (Keyboard.Modifiers == ModifierKeys.Control)
        {
            if (e.Delta > 0)
            {
                ZoomIn();
            }
            else if (e.Delta < 0)
            {
                ZoomOut();
            }
            e.Handled = true;
        }
    }

    #region Zoom Methods

    private void ZoomIn()
    {
        SetZoom(_currentZoomLevel + ZoomStep);
    }

    private void ZoomOut()
    {
        SetZoom(_currentZoomLevel - ZoomStep);
    }

    private void ResetZoom()
    {
        SetZoom(100);
    }

    private void SetZoom(double zoomLevel, bool saveToSettings = true)
    {
        // Clamp zoom level to valid range
        zoomLevel = Math.Max(MinZoom, Math.Min(MaxZoom, zoomLevel));
        _currentZoomLevel = zoomLevel;

        // Apply zoom to active WebView
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView))
        {
            webView.ZoomFactor = zoomLevel / 100.0;

            // Save zoom level for this website
            if (saveToSettings && webView.CoreWebView2 != null)
            {
                var url = webView.CoreWebView2.Source;
                _zoomSettingsManager.SetZoomLevel(url, zoomLevel);
            }
        }

        // Update zoom display
        UpdateZoomDisplay();
    }

    private void UpdateZoomDisplay()
    {
        if (Math.Abs(_currentZoomLevel - 100) < 0.1)
        {
            // At 100%, hide the zoom display
            ZoomLevelButton.Visibility = Visibility.Collapsed;
        }
        else
        {
            // Show zoom level
            ZoomLevelText.Text = $"{_currentZoomLevel:0}%";
            ZoomLevelButton.Visibility = Visibility.Visible;
        }
    }

    private void ZoomLevelButton_Click(object sender, RoutedEventArgs e)
    {
        ResetZoom();
    }

    #endregion

    #region Title Bar Events

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
        {
            ToggleMaximize();
        }
        else
        {
            DragMove();
        }
    }

    private void MinimizeButton_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void MaximizeButton_Click(object sender, RoutedEventArgs e)
    {
        ToggleMaximize();
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void ToggleMaximize()
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    }

    private void ToggleFullScreen()
    {
        if (_isFullScreen)
        {
            // Exit fullscreen mode
            _isFullScreen = false;

            // Restore window state
            WindowState = _preFullScreenState;

            // Show title bar and navigation bar
            if (FindName("TitleBarRow") is RowDefinition titleRow)
                titleRow.Height = new GridLength(36);
            if (FindName("NavBarRow") is RowDefinition navRow)
                navRow.Height = new GridLength(44);
        }
        else
        {
            // Enter fullscreen mode - store current state first
            _isFullScreen = true;
            _preFullScreenState = WindowState;
            _preFullScreenBounds = new Rect(Left, Top, Width, Height);

            // Hide title bar and navigation bar for true fullscreen
            if (FindName("TitleBarRow") is RowDefinition titleRow)
                titleRow.Height = new GridLength(0);
            if (FindName("NavBarRow") is RowDefinition navRow)
                navRow.Height = new GridLength(0);

            // Maximize to cover entire screen including taskbar
            if (WindowState == WindowState.Maximized)
            {
                // Need to toggle to force re-maximize with new constraints
                WindowState = WindowState.Normal;
            }
            WindowState = WindowState.Maximized;
        }
    }

    #endregion

    #region Tab Management

    private async Task<TabState> CreateTabAsync(string url, BrowserMode? mode = null)
    {
        var tabMode = mode ?? _currentMode;
        var tabState = new TabState
        {
            Id = Guid.NewGuid().ToString(),
            Title = "New Tab",
            Url = url,
            Mode = tabMode,
            IsLoading = true
        };

        Tabs.Add(tabState);

        // Create WebView2 for this tab
        // Add margin to expose resize borders (WebView2 HWND intercepts mouse events)
        var webView = new WebView2
        {
            Visibility = Visibility.Collapsed,
            Margin = new Thickness(3, 3, 3, 3)  // Left, Top, Right, Bottom - expose resize areas
        };

        _webViews[tabState.Id] = webView;
        WebViewContainer.Children.Add(webView);

        // Initialize WebView2
        await InitializeWebViewAsync(webView, tabState);

        // Switch to new tab first (so _activeTabId is set)
        SwitchToTab(tabState.Id);

        // Navigate to URL using proper DNS resolution
        if (!string.IsNullOrEmpty(url))
        {
            // Use NavigateToAsync for proper private protocol resolution
            await NavigateToAsync(url);
        }

        return tabState;
    }

    private async Task InitializeWebViewAsync(WebView2 webView, TabState tabState)
    {
        var userDataFolder = GetUserDataFolder(tabState.Mode);
        var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(env);

        // Configure WebView2 settings
        var settings = webView.CoreWebView2.Settings;
        settings.IsStatusBarEnabled = false;
        settings.AreDefaultContextMenusEnabled = true;
        settings.AreDevToolsEnabled = true;
        settings.IsZoomControlEnabled = true;
        settings.IsBuiltInErrorPageEnabled = true;

        // Setup event handlers
        webView.CoreWebView2.NavigationStarting += (s, e) => OnNavigationStarting(tabState.Id, e);
        webView.CoreWebView2.NavigationCompleted += (s, e) => OnNavigationCompleted(tabState.Id, e);
        webView.CoreWebView2.SourceChanged += (s, e) => OnSourceChanged(tabState.Id);
        webView.CoreWebView2.DocumentTitleChanged += (s, e) => OnDocumentTitleChanged(tabState.Id);
        webView.CoreWebView2.FaviconChanged += async (s, e) => await OnFaviconChangedAsync(tabState.Id);
        webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;

        // Setup message bridge for JavaScript communication
        webView.CoreWebView2.WebMessageReceived += (s, e) => OnWebMessageReceived(tabState.Id, e);
    }

    private void SwitchToTab(string tabId)
    {
        if (_activeTabId == tabId) return;

        // Hide current WebView
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var currentWebView))
        {
            currentWebView.Visibility = Visibility.Collapsed;
        }

        // Show new WebView
        if (_webViews.TryGetValue(tabId, out var newWebView))
        {
            newWebView.Visibility = Visibility.Visible;
            _activeTabId = tabId;

            // Update tab selection
            var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
            if (tab != null)
            {
                TabStrip.SelectedItem = tab;
                UpdateNavigationState(tab);
                AddressBar.Text = tab.Url;

                // Update mode and visuals based on the active tab's mode
                if (_currentMode != tab.Mode)
                {
                    _currentMode = tab.Mode;
                    // Update radio buttons without triggering change event
                    ModeRadioWWW.Checked -= ModeRadio_Changed;
                    ModeRadioWWBW.Checked -= ModeRadio_Changed;
                    UpdateModeRadioButtons();
                    ModeRadioWWW.Checked += ModeRadio_Changed;
                    ModeRadioWWBW.Checked += ModeRadio_Changed;
                }
                // Always update visuals to match active tab's mode
                UpdateModeVisuals();
                TabStrip.Items.Refresh();

                // Update address bar icon based on the tab's URL
                // (must be called after UpdateModeVisuals since it resets the icon)
                UpdateAddressBarIcon(tab.Url ?? "");
            }

            // Update zoom level from the new tab's WebView
            _currentZoomLevel = newWebView.ZoomFactor * 100;
            UpdateZoomDisplay();
        }

        UpdateWelcomePanel();
    }

    private void CloseTab(string tabId)
    {
        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab == null) return;

        var tabIndex = Tabs.IndexOf(tab);

        // Add to closed tabs for reopen
        _tabManager.AddClosedTab(tab);

        // Remove tab
        Tabs.Remove(tab);

        // Cleanup WebView
        if (_webViews.TryGetValue(tabId, out var webView))
        {
            WebViewContainer.Children.Remove(webView);
            webView.Dispose();
            _webViews.Remove(tabId);
        }

        // Switch to adjacent tab
        if (_activeTabId == tabId && Tabs.Count > 0)
        {
            var newIndex = Math.Min(tabIndex, Tabs.Count - 1);
            SwitchToTab(Tabs[newIndex].Id);
        }

        UpdateWelcomePanel();
    }

    private void CloseCurrentTab()
    {
        if (_activeTabId != null)
        {
            CloseTab(_activeTabId);
        }
    }

    private void ReopenClosedTab()
    {
        var closedTab = _tabManager.PopClosedTab();
        if (closedTab != null)
        {
            _ = CreateTabAsync(closedTab.Url, closedTab.Mode);
        }
    }

    private void TabStrip_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (TabStrip.SelectedItem is TabState tab && _isInitialized)
        {
            SwitchToTab(tab.Id);
        }
    }

    #region Tab Drag and Drop

    private void TabStrip_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _dragStartPoint = e.GetPosition(null);

        // Find the tab item being clicked
        var element = e.OriginalSource as DependencyObject;
        while (element != null && !(element is ListBoxItem))
        {
            element = VisualTreeHelper.GetParent(element);
        }

        if (element is ListBoxItem listBoxItem && listBoxItem.Content is TabState tab)
        {
            // Don't start drag if clicking the close button
            if (e.OriginalSource is FrameworkElement fe && fe.Name == "closeBtn")
            {
                return;
            }
            _draggedTab = tab;
        }
    }

    private void TabStrip_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed || _draggedTab == null)
        {
            return;
        }

        var currentPos = e.GetPosition(null);
        var diff = _dragStartPoint - currentPos;

        // Check if moved enough to start dragging
        if (Math.Abs(diff.X) > SystemParameters.MinimumHorizontalDragDistance ||
            Math.Abs(diff.Y) > SystemParameters.MinimumVerticalDragDistance)
        {
            if (!_isDragging)
            {
                _isDragging = true;
                var data = new DataObject("TabState", _draggedTab);
                DragDrop.DoDragDrop(TabStrip, data, DragDropEffects.Move);
                _isDragging = false;
                _draggedTab = null;
            }
        }
    }

    private void TabStrip_DragOver(object sender, DragEventArgs e)
    {
        if (e.Data.GetDataPresent("TabState"))
        {
            e.Effects = DragDropEffects.Move;
        }
        else
        {
            e.Effects = DragDropEffects.None;
        }
        e.Handled = true;
    }

    private void TabStrip_Drop(object sender, DragEventArgs e)
    {
        if (!e.Data.GetDataPresent("TabState"))
        {
            return;
        }

        var droppedTab = e.Data.GetData("TabState") as TabState;
        if (droppedTab == null) return;

        // Find the tab we're dropping onto
        var dropPos = e.GetPosition(TabStrip);
        TabState? targetTab = null;
        int targetIndex = Tabs.Count;

        // Find which tab we're dropping near
        for (int i = 0; i < Tabs.Count; i++)
        {
            var container = TabStrip.ItemContainerGenerator.ContainerFromIndex(i) as ListBoxItem;
            if (container != null)
            {
                var tabPos = container.TranslatePoint(new Point(0, 0), TabStrip);
                var tabWidth = container.ActualWidth;

                if (dropPos.X < tabPos.X + tabWidth / 2)
                {
                    targetTab = Tabs[i];
                    targetIndex = i;
                    break;
                }
            }
        }

        // Move the tab
        var currentIndex = Tabs.IndexOf(droppedTab);
        if (currentIndex >= 0 && currentIndex != targetIndex)
        {
            Tabs.RemoveAt(currentIndex);
            if (targetIndex > currentIndex)
            {
                targetIndex--;
            }
            if (targetIndex >= Tabs.Count)
            {
                Tabs.Add(droppedTab);
            }
            else
            {
                Tabs.Insert(targetIndex, droppedTab);
            }

            // Refresh the tab strip
            TabStrip.Items.Refresh();
            TabStrip.SelectedItem = droppedTab;
        }

        e.Handled = true;
    }

    #endregion

    private void TabCloseButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string tabId)
        {
            CloseTab(tabId);
        }
    }

    private void NewTab_Click(object sender, RoutedEventArgs e)
    {
        _ = CreateTabAsync(GetHomepage());
    }

    private void NewTabButton_Click(object sender, MouseButtonEventArgs e)
    {
        _ = CreateTabAsync(GetHomepage());
    }

    private void UpdateWelcomePanel()
    {
        WelcomePanel.Visibility = Tabs.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    #endregion

    #region Navigation

    private void OnNavigationStarting(string tabId, CoreWebView2NavigationStartingEventArgs e)
    {
        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab == null) return;

        // Check blacklist
        if (_blacklistManager.IsBlocked(e.Uri, tab.Mode))
        {
            e.Cancel = true;
            ShowBlockedPage(tabId, e.Uri);
            return;
        }

        tab.IsLoading = true;
        if (tabId == _activeTabId)
        {
            LoadingBar.Visibility = Visibility.Visible;
            ReloadIcon.Text = "\uE711"; // Stop icon
        }
    }

    private void OnNavigationCompleted(string tabId, CoreWebView2NavigationCompletedEventArgs e)
    {
        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab == null) return;

        tab.IsLoading = false;
        if (tabId == _activeTabId)
        {
            LoadingBar.Visibility = Visibility.Collapsed;
            ReloadIcon.Text = "\uE72C"; // Reload icon
            UpdateNavigationState(tab);
        }

        // Restore saved zoom level for this website
        if (e.IsSuccess && _webViews.TryGetValue(tabId, out var webView))
        {
            var url = webView.CoreWebView2?.Source;
            var savedZoom = _zoomSettingsManager.GetZoomLevel(url);
            if (savedZoom.HasValue)
            {
                // Apply saved zoom without re-saving (to avoid infinite loop)
                webView.ZoomFactor = savedZoom.Value / 100.0;
                if (tabId == _activeTabId)
                {
                    _currentZoomLevel = savedZoom.Value;
                    UpdateZoomDisplay();
                }
            }
            // Note: If no saved zoom, keep the current zoom level (don't reset)
            // This allows zoom to persist when navigating within the same domain
        }

        // Add to history and record hit
        if (e.IsSuccess && !string.IsNullOrEmpty(tab.Url))
        {
            _historyManager.AddEntry(tab.Url, tab.Title, tab.Mode);

            // Record platform hit for analytics (fire and forget)
            _ = _hitCountService.RecordHitAsync();
        }
    }

    private void OnSourceChanged(string tabId)
    {
        if (!_webViews.TryGetValue(tabId, out var webView)) return;

        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab == null) return;

        var currentUrl = webView.Source?.ToString() ?? string.Empty;
        tab.IsSecure = currentUrl.StartsWith("https://");

        if (tabId == _activeTabId)
        {
            // Always try to show the private protocol URL instead of the resolved public URL
            // This works in both WWBW mode and WWW mode
            var displayUrl = currentUrl;
            var privateUrl = GetPrivateUrlMapping(tabId, currentUrl);
            if (!string.IsNullOrEmpty(privateUrl))
            {
                displayUrl = privateUrl;
                tab.Url = privateUrl; // Store the private URL in tab state
            }
            else
            {
                tab.Url = currentUrl;
                // Try to reverse resolve the URL to get the private equivalent
                _ = UpdateAddressBarWithPrivateUrlAsync(tabId, currentUrl);
                return; // Will be updated asynchronously
            }
            AddressBar.Text = displayUrl;

            // Update address bar icon based on URL type
            UpdateAddressBarIcon(displayUrl);
        }
        else
        {
            // For non-active tabs, still check for private URL mapping
            var privateUrl = GetPrivateUrlMapping(tabId, currentUrl);
            tab.Url = !string.IsNullOrEmpty(privateUrl) ? privateUrl : currentUrl;
        }
    }

    private async Task UpdateAddressBarWithPrivateUrlAsync(string tabId, string publicUrl)
    {
        try
        {
            var privateUrl = await _dnsResolver.ReverseResolveAsync(publicUrl);
            if (tabId == _activeTabId)
            {
                var displayUrl = privateUrl ?? publicUrl;
                AddressBar.Text = displayUrl;
                UpdateAddressBarIcon(displayUrl);
            }
        }
        catch
        {
            if (tabId == _activeTabId)
            {
                AddressBar.Text = publicUrl;
                UpdateAddressBarIcon(publicUrl);
            }
        }
    }

    /// <summary>
    /// Updates the address bar icon based on the current URL and browser mode.
    /// - In WWBW mode: Always shows WWBW icon (handled by UpdateModeVisuals)
    /// - In WWW mode with inspire:// URL: Shows WWBW icon
    /// - In WWW mode with regular URL: Shows globe icon
    /// </summary>
    private void UpdateAddressBarIcon(string url)
    {
        System.Diagnostics.Debug.WriteLine($"UpdateAddressBarIcon called with url: {url}, mode: {_currentMode}");

        if (_currentMode == BrowserMode.JubileeBibles)
        {
            // In WWBW mode, always show the WWBW icon (already set by UpdateModeVisuals)
            System.Diagnostics.Debug.WriteLine("UpdateAddressBarIcon: WWBW mode, returning early");
            return;
        }

        // In WWW (Internet) mode, check if it's an inspire:// URL
        var isInspireUrl = WWBWDnsResolver.IsPrivateProtocol(url);
        System.Diagnostics.Debug.WriteLine($"UpdateAddressBarIcon: IsPrivateProtocol returned {isInspireUrl}");

        if (isInspireUrl)
        {
            // Show the WWBW icon for inspire:// URLs in WWW mode
            System.Diagnostics.Debug.WriteLine("UpdateAddressBarIcon: Showing WWBW icon (inspire URL)");
            AddressBarGlobeIcon.Visibility = Visibility.Collapsed;
            AddressBarInspireIcon.Visibility = Visibility.Visible;
        }
        else
        {
            // Show the globe icon for regular URLs
            System.Diagnostics.Debug.WriteLine("UpdateAddressBarIcon: Showing globe icon (regular URL)");
            AddressBarGlobeIcon.Visibility = Visibility.Visible;
            AddressBarInspireIcon.Visibility = Visibility.Collapsed;
        }
    }

    private void OnDocumentTitleChanged(string tabId)
    {
        if (!_webViews.TryGetValue(tabId, out var webView)) return;

        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab != null)
        {
            tab.Title = webView.CoreWebView2.DocumentTitle ?? "New Tab";
        }
    }

    private async Task OnFaviconChangedAsync(string tabId)
    {
        if (!_webViews.TryGetValue(tabId, out var webView)) return;

        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab != null)
        {
            // Set the favicon from the website (XAML triggers handle fallback for WWBW tabs)
            tab.Favicon = webView.CoreWebView2.FaviconUri;
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        _ = CreateTabAsync(e.Uri);
    }

    private void UpdateNavigationState(TabState tab)
    {
        if (!_webViews.TryGetValue(tab.Id, out var webView)) return;

        tab.CanGoBack = webView.CanGoBack;
        tab.CanGoForward = webView.CanGoForward;

        BackButton.IsEnabled = tab.CanGoBack;
        ForwardButton.IsEnabled = tab.CanGoForward;
    }

    private void BackButton_Click(object sender, RoutedEventArgs e) => GoBack();
    private void ForwardButton_Click(object sender, RoutedEventArgs e) => GoForward();
    private void ReloadButton_Click(object sender, RoutedEventArgs e) => ReloadCurrentTab();

    private void GoBack()
    {
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView) && webView.CanGoBack)
        {
            webView.GoBack();
        }
    }

    private void GoForward()
    {
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView) && webView.CanGoForward)
        {
            webView.GoForward();
        }
    }

    private void ReloadCurrentTab()
    {
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView))
        {
            var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
            if (tab?.IsLoading == true)
            {
                webView.Stop();
            }
            else
            {
                webView.Reload();
            }
        }
    }

    private async void DeepRefreshCurrentTab()
    {
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView))
        {
            var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
            if (tab?.IsLoading == true)
            {
                webView.Stop();
            }
            else
            {
                // Deep refresh: clear cache and reload
                try
                {
                    // Clear browser cache for this page
                    await webView.CoreWebView2.Profile.ClearBrowsingDataAsync(
                        Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.CacheStorage |
                        Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.DiskCache |
                        Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.DownloadHistory |
                        Microsoft.Web.WebView2.Core.CoreWebView2BrowsingDataKinds.GeneralAutofill);

                    // Reload the page
                    webView.Reload();
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"Deep refresh error: {ex.Message}");
                    // Fallback to regular reload
                    webView.Reload();
                }
            }
        }
    }

    private void HomeButton_Click(object sender, RoutedEventArgs e)
    {
        NavigateTo(GetHomepage());
    }

    private void NavigateTo(string url)
    {
        // Use async version for proper DNS resolution
        _ = NavigateToAsync(url);
    }

    private async Task NavigateToAsync(string url)
    {
        if (_activeTabId == null || !_webViews.TryGetValue(_activeTabId, out var webView))
            return;

        try
        {
            // Check if URL is valid for current mode
            if (!_dnsResolver.IsValidForMode(url, _currentMode))
            {
                // In WWBW mode, regular http/https URLs should open in a new WWW mode tab (blue tab)
                if (_currentMode == BrowserMode.JubileeBibles)
                {
                    // Create a new tab in Internet (WWW) mode with this URL
                    await CreateTabAsync(url, BrowserMode.Internet);
                    return;
                }
            }

            // Resolve the URL (handles both private protocols and regular URLs)
            var resolvedUrl = await ResolveUrlAsync(url);

            if (resolvedUrl == null)
            {
                if (_currentMode == BrowserMode.JubileeBibles)
                {
                    ShowWebspaceErrorPage(_activeTabId, url);
                }
                else
                {
                    ShowInvalidUrlPage(_activeTabId, url, "Unable to resolve this URL. The domain may not exist in the World Wide Bible Web network.");
                }
                return;
            }

            // Check blacklist for the resolved URL
            if (_blacklistManager.IsBlocked(resolvedUrl, _currentMode))
            {
                ShowBlockedPage(_activeTabId, resolvedUrl);
                return;
            }

            // Store the original private URL for display in address bar BEFORE navigating
            // (OnSourceChanged fires when webView.Source is set, so mapping must exist first)
            if (WWBWDnsResolver.IsPrivateProtocol(url))
            {
                StorePrivateUrlMapping(_activeTabId, resolvedUrl, url);
            }

            // Navigate to the resolved URL
            webView.Source = new Uri(resolvedUrl);

            // Update address bar immediately with the private URL
            if (WWBWDnsResolver.IsPrivateProtocol(url))
            {
                AddressBar.Text = url;
                // Also update tab state
                var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
                if (tab != null)
                {
                    tab.Url = url;
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Navigation error: {ex.Message}");
            if (_currentMode == BrowserMode.JubileeBibles)
            {
                ShowWebspaceErrorPage(_activeTabId, url);
            }
            else
            {
                ShowInvalidUrlPage(_activeTabId, url, $"Navigation failed: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Resolves a URL for navigation. Handles both private protocol URLs and regular URLs.
    /// </summary>
    private async Task<string?> ResolveUrlAsync(string url)
    {
        // Check if this is a private protocol URL
        if (WWBWDnsResolver.IsPrivateProtocol(url))
        {
            // Resolve private URL to public URL
            var resolved = await _dnsResolver.ResolveToPublicUrlAsync(url);
            return resolved;
        }

        // Regular URL - validate and return
        return EnsureValidUrl(url);
    }

    // Dictionary to map resolved URLs back to their private protocol URLs
    private readonly Dictionary<string, string> _privateUrlMappings = new(StringComparer.OrdinalIgnoreCase);

    private void StorePrivateUrlMapping(string tabId, string resolvedUrl, string privateUrl)
    {
        var key = $"{tabId}:{resolvedUrl}";
        _privateUrlMappings[key] = privateUrl;
    }

    private string? GetPrivateUrlMapping(string tabId, string resolvedUrl)
    {
        // Try exact match first
        var key = $"{tabId}:{resolvedUrl}";
        if (_privateUrlMappings.TryGetValue(key, out var privateUrl))
            return privateUrl;

        // Try variations (with/without trailing slash, with/without www)
        var urlVariations = new List<string> { resolvedUrl };

        if (resolvedUrl.EndsWith("/"))
            urlVariations.Add(resolvedUrl.TrimEnd('/'));
        else
            urlVariations.Add(resolvedUrl + "/");

        // Try removing/adding www
        if (resolvedUrl.Contains("://www."))
        {
            urlVariations.Add(resolvedUrl.Replace("://www.", "://"));
        }
        else if (resolvedUrl.Contains("://"))
        {
            var idx = resolvedUrl.IndexOf("://");
            urlVariations.Add(resolvedUrl.Insert(idx + 3, "www."));
        }

        foreach (var variation in urlVariations)
        {
            key = $"{tabId}:{variation}";
            if (_privateUrlMappings.TryGetValue(key, out privateUrl))
                return privateUrl;
        }

        // Also try matching just by the host (for cases where the path changes)
        if (Uri.TryCreate(resolvedUrl, UriKind.Absolute, out var uri))
        {
            var hostPattern = $"{tabId}:https://{uri.Host}";
            foreach (var mapping in _privateUrlMappings)
            {
                if (mapping.Key.StartsWith(hostPattern, StringComparison.OrdinalIgnoreCase))
                    return mapping.Value;
            }
            hostPattern = $"{tabId}:http://{uri.Host}";
            foreach (var mapping in _privateUrlMappings)
            {
                if (mapping.Key.StartsWith(hostPattern, StringComparison.OrdinalIgnoreCase))
                    return mapping.Value;
            }
        }

        return null;
    }

    private void ShowInvalidUrlPage(string tabId, string invalidUrl, string message)
    {
        if (!_webViews.TryGetValue(tabId, out var webView)) return;

        var html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>URL Not Available - Jubilee Browser</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .container {{
            text-align: center;
            padding: 40px;
            max-width: 600px;
        }}
        .icon {{
            font-size: 80px;
            margin-bottom: 20px;
            opacity: 0.8;
        }}
        h1 {{
            font-size: 28px;
            margin-bottom: 16px;
            font-weight: 300;
        }}
        .url {{
            background: rgba(255,255,255,0.1);
            padding: 12px 20px;
            border-radius: 8px;
            font-family: monospace;
            margin: 20px 0;
            word-break: break-all;
        }}
        .message {{
            color: rgba(255,255,255,0.7);
            font-size: 14px;
            line-height: 1.6;
            margin-top: 16px;
        }}
        .hint {{
            margin-top: 24px;
            padding: 16px;
            background: rgba(255,215,0,0.1);
            border-radius: 8px;
            border-left: 3px solid #ffd700;
        }}
        .hint-title {{
            color: #ffd700;
            font-weight: 600;
            margin-bottom: 8px;
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='icon'>&#x1F50D;</div>
        <h1>URL Not Available</h1>
        <div class='url'>{System.Web.HttpUtility.HtmlEncode(invalidUrl)}</div>
        <p class='message'>{System.Web.HttpUtility.HtmlEncode(message)}</p>
        <div class='hint'>
            <div class='hint-title'>Tip</div>
            <p>In WWBW mode, use private protocol URLs like:<br>
            <code>inspire://home.inspire</code><br>
            <code>webspace://jubileeverse.webspace</code></p>
        </div>
    </div>
</body>
</html>";

        webView.NavigateToString(html);
    }

    private void ShowWebspaceErrorPage(string tabId, string blockedUrl)
    {
        if (!_webViews.TryGetValue(tabId, out var webView)) return;

        var html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>World Wide Bible Web Only - Jubilee Browser</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }}
        .container {{
            text-align: center;
            max-width: 700px;
            animation: fadeIn 0.5s ease-out;
        }}
        @keyframes fadeIn {{
            from {{ opacity: 0; transform: translateY(-20px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        .bible-icon {{
            font-size: 100px;
            margin-bottom: 24px;
            filter: drop-shadow(0 4px 12px rgba(255, 215, 0, 0.4));
        }}
        h1 {{
            font-size: 2.2rem;
            font-weight: 700;
            color: #FFD700;
            margin-bottom: 16px;
            text-shadow: 0 2px 10px rgba(255, 215, 0, 0.3);
        }}
        .subtitle {{
            font-size: 1.1rem;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 24px;
            line-height: 1.6;
        }}
        .url-box {{
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px 24px;
            margin: 20px 0;
            word-break: break-all;
        }}
        .url-label {{
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.6);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }}
        .url-text {{
            font-size: 0.9rem;
            color: #ff6b6b;
            font-family: 'Consolas', 'Monaco', monospace;
        }}
        .info-section {{
            margin-top: 32px;
            text-align: left;
        }}
        .info-box {{
            background: rgba(255, 215, 0, 0.1);
            border: 1px solid rgba(255, 215, 0, 0.2);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
        }}
        .info-box h3 {{
            color: #FFD700;
            font-size: 1rem;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .info-box p {{
            color: rgba(255, 255, 255, 0.85);
            font-size: 0.9rem;
            line-height: 1.6;
        }}
        .protocol-list {{
            list-style: none;
            margin-top: 12px;
        }}
        .protocol-list li {{
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 6px;
            margin-bottom: 6px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.85rem;
            color: #4ecdc4;
        }}
        .protocol-list li span {{
            color: rgba(255, 255, 255, 0.6);
            font-family: 'Segoe UI', sans-serif;
            margin-left: 8px;
        }}
        .btn-row {{
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 24px;
        }}
        .back-btn {{
            padding: 14px 28px;
            background: linear-gradient(135deg, #FFD700 0%, #E6AC00 100%);
            color: #1a1a2e;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            border: none;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
        }}
        .back-btn:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
        }}
        .home-btn {{
            padding: 14px 28px;
            background: transparent;
            color: #FFD700;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            border: 2px solid #FFD700;
            transition: all 0.3s ease;
        }}
        .home-btn:hover {{
            background: rgba(255, 215, 0, 0.1);
        }}
        .footer {{
            margin-top: 40px;
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.5);
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='bible-icon'>📖</div>
        <h1>World Wide Bible Web Only</h1>
        <p class='subtitle'>
            You are currently browsing in <strong>World Wide Bible Web mode</strong>.<br>
            Regular internet websites are not available in this mode.
        </p>

        <div class='url-box'>
            <div class='url-label'>Attempted URL</div>
            <div class='url-text'>{System.Web.HttpUtility.HtmlEncode(blockedUrl)}</div>
        </div>

        <div class='info-section'>
            <div class='info-box'>
                <h3>📚 What is the World Wide Bible Web?</h3>
                <p>
                    The World Wide Bible Web (WWBW) is a curated network of faith-based content
                    accessible through special protocol addresses. This mode provides a safe,
                    family-friendly browsing experience focused on spiritual resources.
                </p>
            </div>

            <div class='info-box'>
                <h3>🔗 Supported Protocol Addresses</h3>
                <p>In WWBW mode, use these special addresses:</p>
                <ul class='protocol-list'>
                    <li>inspire://jubileeverse.webspace <span>Jubilee Verse Home</span></li>
                    <li>inspire://home.inspire <span>Inspirational Content</span></li>
                    <li>webspace://jubileeverse.webspace <span>Web Spaces</span></li>
                    <li>church://home.church <span>Church Resources</span></li>
                    <li>apostle://home.apostle <span>Apostolic Content</span></li>
                </ul>
            </div>
        </div>

        <div class='btn-row'>
            <button class='back-btn' onclick='history.back()'>← Go Back</button>
            <button class='home-btn' onclick=""window.location.href='about:blank'"">🏠 Go Home</button>
        </div>

        <div class='footer'>
            To access regular websites, switch to Internet mode using the toggle above.
        </div>
    </div>
</body>
</html>";

        webView.NavigateToString(html);

        // Update tab state
        var tab = Tabs.FirstOrDefault(t => t.Id == tabId);
        if (tab != null)
        {
            tab.Title = "WWBW Only";
            tab.Url = "browser://webspace_error";
        }

        // Update address bar
        if (tabId == _activeTabId)
        {
            AddressBar.Text = "browser://webspace_error";
        }
    }

    private void AddressBar_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            NavigateTo(AddressBar.Text);
            // Remove focus from address bar
            if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView))
            {
                webView.Focus();
            }
        }
    }

    private void AddressBar_GotFocus(object sender, RoutedEventArgs e)
    {
        AddressBar.SelectAll();
    }

    private void ShowBlockedPage(string tabId, string blockedUrl)
    {
        if (!_webViews.TryGetValue(tabId, out var webView)) return;

        var html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Content Blocked - Jubilee Browser</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }}
        .container {{
            text-align: center;
            max-width: 600px;
            animation: fadeIn 0.5s ease-out;
        }}
        @keyframes fadeIn {{
            from {{ opacity: 0; transform: translateY(-20px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        .shield {{
            width: 120px;
            height: 140px;
            margin: 0 auto 30px;
            position: relative;
        }}
        .shield svg {{
            width: 100%;
            height: 100%;
            filter: drop-shadow(0 8px 24px rgba(255, 215, 0, 0.4));
        }}
        h1 {{
            font-size: 2.5rem;
            font-weight: 700;
            color: #FFD700;
            margin-bottom: 16px;
            text-shadow: 0 2px 10px rgba(255, 215, 0, 0.3);
        }}
        .subtitle {{
            font-size: 1.2rem;
            color: white;
            margin-bottom: 30px;
            line-height: 1.6;
        }}
        .blocked-url {{
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 16px 24px;
            margin: 20px 0;
            word-break: break-all;
        }}
        .blocked-url-label {{
            font-size: 0.75rem;
            color: white;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }}
        .blocked-url-text {{
            font-size: 0.9rem;
            color: white;
            font-family: 'Consolas', 'Monaco', monospace;
        }}
        .info-box {{
            background: rgba(255, 215, 0, 0.1);
            border: 1px solid rgba(255, 215, 0, 0.2);
            border-radius: 12px;
            padding: 20px;
            margin-top: 30px;
        }}
        .info-box h3 {{
            color: #FFD700;
            font-size: 1rem;
            margin-bottom: 10px;
        }}
        .info-box p {{
            color: white;
            font-size: 0.9rem;
            line-height: 1.5;
        }}
        .back-btn {{
            display: inline-block;
            margin-top: 30px;
            padding: 14px 32px;
            background: linear-gradient(135deg, #FFD700 0%, #E6AC00 100%);
            color: #1a1a2e;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            border: none;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
        }}
        .back-btn:hover {{
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
        }}
        .footer {{
            margin-top: 40px;
            font-size: 0.8rem;
            color: white;
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='shield'>
            <svg viewBox='0 0 100 120' xmlns='http://www.w3.org/2000/svg'>
                <defs>
                    <linearGradient id='shieldGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
                        <stop offset='0%' style='stop-color:#FFD700'/>
                        <stop offset='100%' style='stop-color:#E6AC00'/>
                    </linearGradient>
                </defs>
                <path d='M50 5 L95 25 L95 55 C95 85 50 115 50 115 C50 115 5 85 5 55 L5 25 Z'
                      fill='url(#shieldGrad)' stroke='#B8860B' stroke-width='3'/>
                <text x='50' y='72' text-anchor='middle' font-size='40' font-weight='bold' fill='#1a1a2e'>✓</text>
            </svg>
        </div>
        <h1>Content Blocked</h1>
        <p class='subtitle'>This website has been blocked by Jubilee Browser's protection system to keep you safe.</p>

        <div class='blocked-url'>
            <div class='blocked-url-label'>Blocked URL</div>
            <div class='blocked-url-text'>{System.Web.HttpUtility.HtmlEncode(blockedUrl)}</div>
        </div>

        <div class='info-box'>
            <h3>Why was this blocked?</h3>
            <p>This site appears on our blocklist which includes sites containing adult content, malware, phishing attempts, gambling, or other harmful material.</p>
        </div>

        <button class='back-btn' onclick='history.back()'>← Go Back</button>

        <div class='footer'>
            Protected by Jubilee Browser
        </div>
    </div>
</body>
</html>";

        webView.NavigateToString(html);
    }

    #endregion

    #region Mode Management

    private void UpdateModeRadioButtons()
    {
        if (_currentMode == BrowserMode.JubileeBibles)
        {
            ModeRadioWWBW.IsChecked = true;
            ModeRadioWWW.IsChecked = false;
            // Hide the duplicate globe toggle in right actions since we have AddressBarModeGlobeButton
            ModeToggleBorder.Visibility = Visibility.Collapsed;
            ModeToggleGlobeIcon.Visibility = Visibility.Collapsed;
            ModeToggleAvatarBorder.Visibility = Visibility.Collapsed;
            // Address bar mode buttons - show globe to switch to WWW
            AddressBarModeGlobeButton.Visibility = Visibility.Visible;
            AddressBarModeBibleButton.Visibility = Visibility.Collapsed;
        }
        else
        {
            ModeRadioWWW.IsChecked = true;
            ModeRadioWWBW.IsChecked = false;
            // Hide all mode toggle buttons in right actions
            ModeToggleBorder.Visibility = Visibility.Collapsed;
            ModeToggleGlobeIcon.Visibility = Visibility.Collapsed;
            ModeToggleAvatarBorder.Visibility = Visibility.Collapsed;
            // Address bar mode buttons - show bible to switch to WWBW
            AddressBarModeGlobeButton.Visibility = Visibility.Collapsed;
            AddressBarModeBibleButton.Visibility = Visibility.Visible;
        }
    }

    private void ModeToggle_Click(object sender, RoutedEventArgs e)
    {
        // Toggle between modes
        if (_currentMode == BrowserMode.JubileeBibles)
        {
            ModeRadioWWW.IsChecked = true;
        }
        else
        {
            ModeRadioWWBW.IsChecked = true;
        }
    }

    private void AddressBarModeGlobeButton_MouseEnter(object sender, MouseEventArgs e)
    {
        AddressBarModeGlobeIcon.Foreground = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromRgb(255, 215, 0)); // Gold/Yellow #FFD700
    }

    private void AddressBarModeGlobeButton_MouseLeave(object sender, MouseEventArgs e)
    {
        AddressBarModeGlobeIcon.Foreground = System.Windows.Media.Brushes.Black;
    }

    private void AddressBarModeBibleButton_MouseEnter(object sender, MouseEventArgs e)
    {
        // Show color icon, hide white icon on hover
        WWBWButtonIconWhite.Visibility = Visibility.Collapsed;
        WWBWButtonIconColor.Visibility = Visibility.Visible;
    }

    private void AddressBarModeBibleButton_MouseLeave(object sender, MouseEventArgs e)
    {
        // Show white icon, hide color icon on mouse leave
        WWBWButtonIconWhite.Visibility = Visibility.Visible;
        WWBWButtonIconColor.Visibility = Visibility.Collapsed;
    }

    private async void ModeRadio_Changed(object sender, RoutedEventArgs e)
    {
        if (!_isInitialized || ModeRadioWWBW == null || ModeRadioWWW == null || TabStrip == null)
        {
            return;
        }

        var newMode = ModeRadioWWBW.IsChecked == true ? BrowserMode.JubileeBibles : BrowserMode.Internet;
        if (newMode == _currentMode) return; // Avoid double processing

        _currentMode = newMode;

        // Check if there's an existing tab in the target mode
        var existingTab = Tabs.FirstOrDefault(t => t.Mode == newMode);

        if (existingTab != null)
        {
            // Switch to existing tab in the target mode
            SwitchToTab(existingTab.Id);
        }
        else
        {
            // Create a new tab in the new mode
            var newTab = await CreateTabAsync(GetHomepage(), _currentMode);
            SwitchToTab(newTab.Id);
        }

        // Apply visual styling for the current mode
        UpdateModeVisuals();

        // Update address bar icon based on current URL (after UpdateModeVisuals resets it)
        var activeTab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
        if (activeTab != null)
        {
            UpdateAddressBarIcon(activeTab.Url ?? "");
        }

        // Sync mode toggle UI without re-triggering mode changes
        ModeRadioWWW.Checked -= ModeRadio_Changed;
        ModeRadioWWBW.Checked -= ModeRadio_Changed;
        UpdateModeRadioButtons();
        ModeRadioWWW.Checked += ModeRadio_Changed;
        ModeRadioWWBW.Checked += ModeRadio_Changed;

        // Refresh tab list to update opacity/fading of inactive tabs
        TabStrip.Items.Refresh();
    }

    private void UpdateModeVisuals()
    {
        // Color definitions
        var wwbwBlue = System.Windows.Media.Color.FromRgb(0, 153, 255);  // #0099FF
        var wwbwYellow = System.Windows.Media.Color.FromRgb(255, 215, 0); // #FFD700
        var darkBg = System.Windows.Media.Color.FromRgb(26, 26, 46);     // #1a1a2e

        var wwbwBlueBrush = new System.Windows.Media.SolidColorBrush(wwbwBlue);
        var wwbwYellowBrush = new System.Windows.Media.SolidColorBrush(wwbwYellow);
        var darkBgBrush = new System.Windows.Media.SolidColorBrush(darkBg);

        // Title bar: Always dark in both modes
        TitleBar.Background = darkBgBrush;

        // Update the UI to reflect the current mode
        if (_currentMode == BrowserMode.JubileeBibles)
        {
            // === WORLDWIDE BIBLE WEB MODE ===
            // Navigation bar: Yellow (#FFD700)
            NavigationBar.Background = wwbwYellowBrush;

            // WebView container background
            WebViewContainer.Background = (System.Windows.Media.Brush)FindResource("BgPrimaryBrush");

            // Address bar: Black background, bold yellow text
            AddressBar.Background = System.Windows.Media.Brushes.Black;
            AddressBar.Foreground = wwbwYellowBrush;
            AddressBar.FontWeight = FontWeights.Bold;

            // Address bar icon: Show WWBW icon, hide globe and inspire icon
            AddressBarWWBWIcon.Visibility = Visibility.Visible;
            AddressBarGlobeIcon.Visibility = Visibility.Collapsed;
            AddressBarInspireIcon.Visibility = Visibility.Collapsed;

            // Apply WWBW mode button style (black icons on yellow, hover effect)
            ApplyWWBWButtonStyle(BackButton);
            ApplyWWBWButtonStyle(ForwardButton);
            ApplyWWBWButtonStyle(ReloadButton);
            // BookmarkButton is inside address bar - don't apply nav bar style
            ApplyWWBWButtonStyle(HistoryButton);
            ApplyWWBWButtonStyle(BookmarksButton);
            ApplyWWBWButtonStyle(SettingsButton);
            ApplyWWBWButtonStyle(MenuButton);

            // Update icon foregrounds to black (for yellow nav bar)
            var blackBrush = System.Windows.Media.Brushes.Black;
            SetButtonIconForeground(BackButton, blackBrush);
            SetButtonIconForeground(ForwardButton, blackBrush);
            SetButtonIconForeground(ReloadButton, blackBrush);
            // BookmarkButton is inside the address bar (black bg), so use yellow
            SetButtonIconForeground(BookmarkButton, wwbwYellowBrush);
            SetButtonIconForeground(HistoryButton, blackBrush);
            SetButtonIconForeground(BookmarksButton, blackBrush);
            SetButtonIconForeground(SettingsButton, blackBrush);
            SetButtonIconForeground(MenuButton, blackBrush);

            // Zoom level text should be yellow on black address bar
            ZoomLevelText.Foreground = wwbwYellowBrush;
        }
        else
        {
            // === INTERNET MODE ===
            // Navigation bar: Blue (#0099FF)
            NavigationBar.Background = wwbwBlueBrush;

            // WebView container background
            WebViewContainer.Background = (System.Windows.Media.Brush)FindResource("BgPrimaryBrush");

            // Address bar: Dark blue background to match toggle switch, white bold text
            AddressBar.Background = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(0, 102, 170)); // #0066AA - dark blue
            AddressBar.Foreground = System.Windows.Media.Brushes.White;
            AddressBar.FontWeight = FontWeights.Bold;

            // Address bar icon: Show globe by default, hide WWBW icon
            // (inspire icon visibility is managed separately based on URL)
            AddressBarWWBWIcon.Visibility = Visibility.Collapsed;
            AddressBarGlobeIcon.Visibility = Visibility.Visible;
            AddressBarInspireIcon.Visibility = Visibility.Collapsed;

            // Apply Internet mode button style (white icons on blue, hover effect)
            ApplyInternetButtonStyle(BackButton);
            ApplyInternetButtonStyle(ForwardButton);
            ApplyInternetButtonStyle(ReloadButton);
            // BookmarkButton is inside address bar - don't apply nav bar style
            ApplyInternetButtonStyle(HistoryButton);
            ApplyInternetButtonStyle(BookmarksButton);
            ApplyInternetButtonStyle(SettingsButton);
            ApplyInternetButtonStyle(MenuButton);

            // Update icon foregrounds to white (for blue nav bar)
            SetButtonIconForeground(BackButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(ForwardButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(ReloadButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(BookmarkButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(HistoryButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(BookmarksButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(SettingsButton, System.Windows.Media.Brushes.White);
            SetButtonIconForeground(MenuButton, System.Windows.Media.Brushes.White);

            // Zoom level text should be white on blue address bar
            ZoomLevelText.Foreground = System.Windows.Media.Brushes.White;
        }
    }

    private void ApplyWWBWButtonStyle(Button button)
    {
        // Create style for WWBW mode: transparent bg, black text (on yellow nav bar)
        var style = new Style(typeof(Button));
        style.Setters.Add(new Setter(Button.BackgroundProperty, System.Windows.Media.Brushes.Transparent));
        style.Setters.Add(new Setter(Button.ForegroundProperty, System.Windows.Media.Brushes.Black));
        style.Setters.Add(new Setter(Button.BorderThicknessProperty, new Thickness(0)));
        style.Setters.Add(new Setter(Button.WidthProperty, 32.0));
        style.Setters.Add(new Setter(Button.HeightProperty, 32.0));
        style.Setters.Add(new Setter(Button.CursorProperty, Cursors.Hand));

        // Template with hover effect
        var template = new ControlTemplate(typeof(Button));
        var border = new FrameworkElementFactory(typeof(Border));
        border.Name = "border";
        border.SetValue(Border.BackgroundProperty, System.Windows.Media.Brushes.Transparent);
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        border.SetValue(Border.PaddingProperty, new Thickness(4));

        var contentPresenter = new FrameworkElementFactory(typeof(ContentPresenter));
        contentPresenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        contentPresenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        border.AppendChild(contentPresenter);

        template.VisualTree = border;

        // Hover trigger - darker yellow/gold background
        var hoverTrigger = new Trigger { Property = Button.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty,
            new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(204, 153, 0)), // Darker gold #CC9900
            "border"));
        template.Triggers.Add(hoverTrigger);

        // Pressed trigger
        var pressedTrigger = new Trigger { Property = Button.IsPressedProperty, Value = true };
        pressedTrigger.Setters.Add(new Setter(Border.BackgroundProperty,
            new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(179, 134, 0)), // Even darker #B38600
            "border"));
        template.Triggers.Add(pressedTrigger);

        // Disabled trigger
        var disabledTrigger = new Trigger { Property = Button.IsEnabledProperty, Value = false };
        disabledTrigger.Setters.Add(new Setter(Button.OpacityProperty, 0.4));
        template.Triggers.Add(disabledTrigger);

        style.Setters.Add(new Setter(Button.TemplateProperty, template));
        button.Style = style;
    }

    private void ApplyInternetButtonStyle(Button button)
    {
        // Create style for Internet mode: transparent bg, white text (on blue nav bar)
        var style = new Style(typeof(Button));
        style.Setters.Add(new Setter(Button.BackgroundProperty, System.Windows.Media.Brushes.Transparent));
        style.Setters.Add(new Setter(Button.ForegroundProperty, System.Windows.Media.Brushes.White));
        style.Setters.Add(new Setter(Button.BorderThicknessProperty, new Thickness(0)));
        style.Setters.Add(new Setter(Button.WidthProperty, 32.0));
        style.Setters.Add(new Setter(Button.HeightProperty, 32.0));
        style.Setters.Add(new Setter(Button.CursorProperty, Cursors.Hand));

        // Template with hover effect
        var template = new ControlTemplate(typeof(Button));
        var border = new FrameworkElementFactory(typeof(Border));
        border.Name = "border";
        border.SetValue(Border.BackgroundProperty, System.Windows.Media.Brushes.Transparent);
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
        border.SetValue(Border.PaddingProperty, new Thickness(4));

        var contentPresenter = new FrameworkElementFactory(typeof(ContentPresenter));
        contentPresenter.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
        contentPresenter.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
        border.AppendChild(contentPresenter);

        template.VisualTree = border;

        // Hover trigger - darker blue background
        var hoverTrigger = new Trigger { Property = Button.IsMouseOverProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty,
            new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0, 119, 204)), // Darker blue #0077CC
            "border"));
        template.Triggers.Add(hoverTrigger);

        // Pressed trigger
        var pressedTrigger = new Trigger { Property = Button.IsPressedProperty, Value = true };
        pressedTrigger.Setters.Add(new Setter(Border.BackgroundProperty,
            new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0, 85, 170)), // Even darker #0055AA
            "border"));
        template.Triggers.Add(pressedTrigger);

        // Disabled trigger
        var disabledTrigger = new Trigger { Property = Button.IsEnabledProperty, Value = false };
        disabledTrigger.Setters.Add(new Setter(Button.OpacityProperty, 0.4));
        template.Triggers.Add(disabledTrigger);

        style.Setters.Add(new Setter(Button.TemplateProperty, template));
        button.Style = style;
    }

    private void SetButtonIconForeground(Button button, System.Windows.Media.Brush brush)
    {
        // Find the TextBlock inside the button and set its foreground
        if (button.Content is TextBlock textBlock)
        {
            textBlock.Foreground = brush;
        }
    }

    private string GetHomepage()
    {
        var defaultHomepage = "http://www.jubileeverse.com";
        var homepage = _settingsManager?.Settings?.Homepage;
        if (homepage == null)
            return defaultHomepage;

        return _currentMode == BrowserMode.JubileeBibles
            ? homepage.JubileeBibles ?? defaultHomepage
            : homepage.Internet ?? defaultHomepage;
    }

    private string GetUserDataFolder(BrowserMode mode)
    {
        var baseFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );

        return mode == BrowserMode.JubileeBibles
            ? Path.Combine(baseFolder, "WebView2_JubileeBibles")
            : Path.Combine(baseFolder, "WebView2_Internet");
    }

    #endregion

    #region Bookmarks & History

    private void BookmarkButton_Click(object sender, RoutedEventArgs e)
    {
        BookmarkCurrentPage();
    }

    private void BookmarkCurrentPage()
    {
        if (_activeTabId == null) return;

        var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
        if (tab == null) return;

        if (_bookmarkManager.IsBookmarked(tab.Url))
        {
            _bookmarkManager.RemoveBookmark(tab.Url);
            BookmarkIcon.Text = "\uE734"; // Empty star
        }
        else
        {
            _bookmarkManager.AddBookmark(tab.Url, tab.Title, tab.Mode, tab.Favicon);
            BookmarkIcon.Text = "\uE735"; // Filled star
        }
    }

    private void HistoryButton_Click(object sender, RoutedEventArgs e)
    {
        ShowHistory();
    }

    private void BookmarksButton_Click(object sender, RoutedEventArgs e)
    {
        ShowBookmarks();
    }

    private void ShowHistory()
    {
        SidePanelTitle.Text = "History";
        SidePanelList.ItemsSource = _historyManager.GetEntries(_currentMode, 100)
            .Select(h => new { h.Title, h.Url, Display = $"{h.Title}\n{h.Url}" });
        ShowSidePanel();
    }

    private void ShowBookmarks()
    {
        SidePanelTitle.Text = "Bookmarks";
        SidePanelList.ItemsSource = _bookmarkManager.GetBookmarks(_currentMode)
            .Select(b => new { b.Title, b.Url, Display = $"{b.Title}\n{b.Url}" });
        ShowSidePanel();
    }

    private void ShowSidePanel()
    {
        SidePanel.Visibility = Visibility.Visible;
        SidePanelColumn.Width = new GridLength(300);
    }

    private void CloseSidePanel_Click(object sender, RoutedEventArgs e)
    {
        SidePanel.Visibility = Visibility.Collapsed;
        SidePanelColumn.Width = new GridLength(0);
    }

    private void SidePanelList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SidePanelList.SelectedItem != null)
        {
            var item = SidePanelList.SelectedItem;
            var urlProperty = item.GetType().GetProperty("Url");
            if (urlProperty?.GetValue(item) is string url)
            {
                NavigateTo(url);
            }
            SidePanelList.SelectedItem = null;
        }
    }

    #endregion

    #region Settings & Menu

    private void SettingsButton_Click(object sender, RoutedEventArgs e)
    {
        // TODO: Open settings page
        NavigateTo("jubilee://settings");
    }

    private void MenuButton_Click(object sender, RoutedEventArgs e)
    {
        // Create menu with proper styling to remove white bar
        var menu = new ContextMenu
        {
            Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(42, 42, 78)),
            Foreground = System.Windows.Media.Brushes.White,
            BorderBrush = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(58, 58, 94)),
            BorderThickness = new Thickness(1),
            Padding = new Thickness(0),
            HasDropShadow = true
        };

        // Create custom template for MenuItem to remove icon column
        var menuItemStyle = new Style(typeof(MenuItem));
        var darkBg = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(42, 42, 78));
        var hoverBg = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(58, 58, 94));

        // Create a custom template that removes the icon/check column
        var template = new ControlTemplate(typeof(MenuItem));
        var borderFactory = new FrameworkElementFactory(typeof(Border));
        borderFactory.Name = "Border";
        borderFactory.SetValue(Border.BackgroundProperty, darkBg);
        borderFactory.SetValue(Border.PaddingProperty, new Thickness(12, 8, 12, 8));
        borderFactory.SetValue(Border.BorderThicknessProperty, new Thickness(0));

        var gridFactory = new FrameworkElementFactory(typeof(Grid));

        var col1 = new FrameworkElementFactory(typeof(ColumnDefinition));
        col1.SetValue(ColumnDefinition.WidthProperty, new GridLength(1, GridUnitType.Star));
        var col2 = new FrameworkElementFactory(typeof(ColumnDefinition));
        col2.SetValue(ColumnDefinition.WidthProperty, GridLength.Auto);

        gridFactory.AppendChild(col1);
        gridFactory.AppendChild(col2);

        var contentFactory = new FrameworkElementFactory(typeof(ContentPresenter));
        contentFactory.SetValue(Grid.ColumnProperty, 0);
        contentFactory.SetValue(ContentPresenter.ContentSourceProperty, "Header");
        contentFactory.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);

        var gestureFactory = new FrameworkElementFactory(typeof(TextBlock));
        gestureFactory.SetValue(Grid.ColumnProperty, 1);
        gestureFactory.SetBinding(TextBlock.TextProperty, new System.Windows.Data.Binding("InputGestureText") { RelativeSource = new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent) });
        gestureFactory.SetValue(TextBlock.ForegroundProperty, new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(160, 160, 160)));
        gestureFactory.SetValue(TextBlock.MarginProperty, new Thickness(24, 0, 0, 0));
        gestureFactory.SetValue(TextBlock.VerticalAlignmentProperty, VerticalAlignment.Center);

        gridFactory.AppendChild(contentFactory);
        gridFactory.AppendChild(gestureFactory);
        borderFactory.AppendChild(gridFactory);
        template.VisualTree = borderFactory;

        // Hover trigger for template
        var hoverTrigger = new Trigger { Property = MenuItem.IsHighlightedProperty, Value = true };
        hoverTrigger.Setters.Add(new Setter(Border.BackgroundProperty, hoverBg, "Border"));
        template.Triggers.Add(hoverTrigger);

        menuItemStyle.Setters.Add(new Setter(MenuItem.TemplateProperty, template));
        menu.Resources.Add(typeof(MenuItem), menuItemStyle);

        // Separator style
        var separatorStyle = new Style(typeof(Separator));
        separatorStyle.Setters.Add(new Setter(Separator.BackgroundProperty,
            new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(58, 58, 94))));
        separatorStyle.Setters.Add(new Setter(Separator.MarginProperty, new Thickness(8, 4, 8, 4)));
        separatorStyle.Setters.Add(new Setter(Separator.HeightProperty, 1.0));
        menu.Resources.Add(typeof(Separator), separatorStyle);

        AddMenuItem(menu, "\uE710", "New Tab", () => _ = CreateTabAsync(GetHomepage()), "Ctrl+T");
        AddMenuItem(menu, "\uE78B", "New Window", () => new MainWindow().Show());
        menu.Items.Add(new Separator());
        AddMenuItem(menu, "\uE81C", "History", ShowHistory, "Ctrl+H");
        AddMenuItem(menu, "\uE728", "Bookmarks", ShowBookmarks, "Ctrl+Shift+B");
        AddMenuItem(menu, "\uE896", "Downloads", () => { }); // TODO
        menu.Items.Add(new Separator());
        AddMenuItem(menu, "\uE8A3", "Zoom In", ZoomIn, "Ctrl++");
        AddMenuItem(menu, "\uE71F", "Zoom Out", ZoomOut, "Ctrl+-");
        AddMenuItem(menu, "\uE73F", "Reset Zoom", ResetZoom, "Ctrl+0");
        menu.Items.Add(new Separator());
        AddMenuItem(menu, "\uE749", "Print", PrintPage, "Ctrl+P");
        AddMenuItem(menu, "\uE713", "Settings", () => NavigateTo("jubilee://settings"));
        menu.Items.Add(new Separator());
        AddMenuItem(menu, "\uE946", "About Jubilee Browser", ShowAbout);
        AddMenuItem(menu, "\uE7E8", "Exit", Close, "Alt+F4");

        // Position menu below the navigation bar
        menu.PlacementTarget = NavigationBar;
        menu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
        menu.HorizontalOffset = NavigationBar.ActualWidth - 200; // Align to right side
        menu.IsOpen = true;
    }

    private void AddMenuItem(ContextMenu menu, string icon, string header, Action action, string? gesture = null)
    {
        var item = new MenuItem
        {
            InputGestureText = gesture ?? string.Empty
        };

        // Create header with icon
        var headerPanel = new StackPanel { Orientation = Orientation.Horizontal };
        headerPanel.Children.Add(new TextBlock
        {
            Text = icon,
            FontFamily = new System.Windows.Media.FontFamily("Segoe MDL2 Assets"),
            FontSize = 14,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 10, 0),
            Foreground = System.Windows.Media.Brushes.White
        });
        headerPanel.Children.Add(new TextBlock
        {
            Text = header,
            VerticalAlignment = VerticalAlignment.Center,
            Foreground = System.Windows.Media.Brushes.White
        });
        item.Header = headerPanel;

        item.Click += (s, e) => action();
        menu.Items.Add(item);
    }

    private async void PrintPage()
    {
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView))
        {
            await webView.CoreWebView2.ExecuteScriptAsync("window.print()");
        }
    }

    private void ShowAbout()
    {
        var aboutWindow = new AboutWindow
        {
            Owner = this
        };
        aboutWindow.ShowDialog();
    }

    #endregion

    #region Context Menu Handlers

    private void DuplicateTab_Click(object sender, RoutedEventArgs e)
    {
        if (_activeTabId != null)
        {
            var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
            if (tab != null)
            {
                _ = CreateTabAsync(tab.Url, tab.Mode);
            }
        }
    }

    private void PinTab_Click(object sender, RoutedEventArgs e)
    {
        if (_activeTabId != null)
        {
            var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
            if (tab != null)
            {
                tab.IsPinned = !tab.IsPinned;
            }
        }
    }

    private void MuteTab_Click(object sender, RoutedEventArgs e)
    {
        if (_activeTabId != null && _webViews.TryGetValue(_activeTabId, out var webView))
        {
            var tab = Tabs.FirstOrDefault(t => t.Id == _activeTabId);
            if (tab != null)
            {
                tab.IsMuted = !tab.IsMuted;
                webView.CoreWebView2.IsMuted = tab.IsMuted;
            }
        }
    }

    private void CloseCurrentTab_Click(object sender, RoutedEventArgs e)
    {
        CloseCurrentTab();
    }

    private void CloseOtherTabs_Click(object sender, RoutedEventArgs e)
    {
        if (_activeTabId == null) return;

        var tabsToClose = Tabs.Where(t => t.Id != _activeTabId).ToList();
        foreach (var tab in tabsToClose)
        {
            CloseTab(tab.Id);
        }
    }

    private void CloseTabsToRight_Click(object sender, RoutedEventArgs e)
    {
        if (_activeTabId == null) return;

        var activeIndex = Tabs.ToList().FindIndex(t => t.Id == _activeTabId);
        var tabsToClose = Tabs.Skip(activeIndex + 1).ToList();

        foreach (var tab in tabsToClose)
        {
            CloseTab(tab.Id);
        }
    }

    private void ReopenClosedTab_Click(object sender, RoutedEventArgs e)
    {
        ReopenClosedTab();
    }

    #endregion

    #region Tab Manager Events

    private void OnTabCreated(object? sender, TabState tab) { }
    private void OnTabClosed(object? sender, string tabId) { }
    private void OnTabUpdated(object? sender, TabState tab) { }
    private void OnActiveTabChanged(object? sender, string? tabId) { }

    #endregion

    #region WebView Message Bridge

    private void OnWebMessageReceived(string tabId, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Handle messages from JavaScript
        var message = e.WebMessageAsJson;
        // TODO: Parse and handle messages for IPC-like communication
    }

    #endregion

    #region Session Management

    private void SaveSessionState(bool flushImmediately = false)
    {
        // Get window bounds - use restore bounds if maximized/minimized to save the "normal" position
        var bounds = (WindowState == WindowState.Normal && !_isFullScreen)
            ? new WindowBounds { X = Left, Y = Top, Width = Width, Height = Height }
            : new WindowBounds { X = _restoreBounds.X, Y = _restoreBounds.Y, Width = _restoreBounds.Width, Height = _restoreBounds.Height };

        // Ensure we have valid bounds
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            bounds = new WindowBounds { X = 100, Y = 100, Width = 1280, Height = 800 };
        }

        var state = new SessionState
        {
            WindowBounds = bounds,
            IsMaximized = WindowState == WindowState.Maximized && !_isFullScreen,
            IsMinimized = WindowState == WindowState.Minimized,
            LastMonitor = GetCurrentMonitor(),
            CurrentMode = _currentMode,
            ActiveTabId = _activeTabId,
            HasSavedState = true,
            Tabs = Tabs.Select(t => new SessionTabState
            {
                Id = t.Id,
                Url = t.Url,
                Title = t.Title,
                Mode = t.Mode,
                IsActive = t.Id == _activeTabId
            }).ToList()
        };

        if (flushImmediately)
        {
            // Use synchronous save to avoid async deadlock during shutdown
            _sessionStateManager.SaveImmediateSync(state);
        }
        else
        {
            _ = _sessionStateManager.SaveAsync(state);
        }
    }

    #endregion

    #region Helpers

    private static string EnsureValidUrl(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return "about:blank";

        // Handle special "homepage" placeholder - go to about:blank or a default page
        if (input.Equals("homepage", StringComparison.OrdinalIgnoreCase))
        {
            return "about:blank";
        }

        // Check if it's a private protocol URL (inspire://, webspace://, etc.)
        if (WWBWDnsResolver.IsPrivateProtocol(input))
        {
            // Private protocol URLs are handled by the DNS resolver, not here
            // Return as-is - the caller should use ResolveUrlAsync instead
            return input;
        }

        // Check if it's already a valid URL
        if (Uri.TryCreate(input, UriKind.Absolute, out var uri))
        {
            if (uri.Scheme == "http" || uri.Scheme == "https" || uri.Scheme == "file" || uri.Scheme == "jubilee")
            {
                return input;
            }
        }

        // Check if it looks like a domain
        if (input.Contains('.') && !input.Contains(' '))
        {
            return "https://" + input;
        }

        // Treat as search query
        return $"https://www.google.com/search?q={Uri.EscapeDataString(input)}";
    }

    #endregion
}
