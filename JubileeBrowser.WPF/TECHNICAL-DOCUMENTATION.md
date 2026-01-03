# Jubilee Browser WPF - Technical Documentation

This document covers the technical implementation details of the Jubilee Browser WPF application, particularly the custom window chrome and resize functionality.

## Table of Contents

1. [Window Chrome Implementation](#window-chrome-implementation)
2. [WebView2 and the Airspace Problem](#webview2-and-the-airspace-problem)
3. [Resize Border Implementation](#resize-border-implementation)
4. [Win32 Message Handling](#win32-message-handling)
5. [Known Issues and Solutions](#known-issues-and-solutions)

---

## Window Chrome Implementation

### Overview

Jubilee Browser uses a custom borderless window (`WindowStyle="None"`) to provide a modern, seamless UI. This requires handling several Win32 messages manually to maintain proper window behavior.

### Key Window Properties (MainWindow.xaml)

```xml
<Window
    WindowStyle="None"
    ResizeMode="CanResize"
    AllowsTransparency="False"
    Background="#000000">
```

- **WindowStyle="None"**: Removes the standard Windows title bar and borders
- **ResizeMode="CanResize"**: Allows window resizing (without the resize grip - use `CanResizeWithGrip` if you want the triangle dots in bottom-right corner)
- **AllowsTransparency="False"**: Better performance than transparent windows
- **Background="#000000"**: Prevents white flashing during resize

---

## WebView2 and the Airspace Problem

### The Problem

WebView2 uses a separate Win32 HWND (window handle) that sits on top of WPF content due to the "airspace" problem. This causes:

1. **Mouse events are intercepted**: WebView2's HWND returns `HTCLIENT` from `WM_NCHITTEST`, consuming all mouse messages before they can reach the parent WPF window
2. **WM_NCHITTEST doesn't work on edges**: Custom resize hit-testing in `WM_NCHITTEST` fails because the WebView2 control covers the window edges
3. **Overlay controls don't work**: WPF elements cannot be displayed on top of WebView2

### The Solution

**Add margin to WebView2 to expose resize areas:**

```csharp
// In MainWindow.xaml.cs - CreateTabAsync method
var webView = new WebView2
{
    Visibility = Visibility.Collapsed,
    Margin = new Thickness(3, 3, 3, 3)  // Left, Top, Right, Bottom - expose resize areas
};
```

This creates a 3-pixel margin around the WebView2 where the parent window can receive mouse messages.

### Reference Issues

- [GitHub Issue #4538: Can't Resize Window with Full-Window WebView2](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4538)
- [GitHub Issue #704: Resizing a borderless WebView2](https://github.com/MicrosoftEdge/WebView2Feedback/issues/704)
- [GitHub Issue #446: Ability to handle WM_NCHITTEST](https://github.com/MicrosoftEdge/WebView2Feedback/issues/446)
- [GitHub Issue #286: Unable to overlay WPF controls on WebView](https://github.com/MicrosoftEdge/WebView2Feedback/issues/286)

---

## Resize Border Implementation

### Approach

The resize functionality uses two complementary techniques:

1. **WM_NCHITTEST handling**: Provides resize cursors and standard resize behavior in the margin areas
2. **Invisible Rectangle overlays**: XAML elements that catch mouse clicks and trigger `WM_SYSCOMMAND` resize

### XAML Resize Rectangles (MainWindow.xaml)

These must be placed **LAST** in the root Grid to render on top of everything:

```xml
<!-- RESIZE BORDERS - Must be LAST in Grid to be on top of WebView2 -->

<!-- Left Edge -->
<Rectangle x:Name="ResizeLeft"
           Grid.Row="2"
           Width="3"
           HorizontalAlignment="Left"
           Fill="Transparent"
           Cursor="SizeWE"
           MouseLeftButtonDown="ResizeBorder_MouseLeftButtonDown"
           Tag="Left"/>

<!-- Right Edge -->
<Rectangle x:Name="ResizeRight"
           Grid.Row="2"
           Width="3"
           HorizontalAlignment="Right"
           Fill="Transparent"
           Cursor="SizeWE"
           MouseLeftButtonDown="ResizeBorder_MouseLeftButtonDown"
           Tag="Right"/>

<!-- Bottom Edge -->
<Rectangle x:Name="ResizeBottom"
           Grid.Row="2"
           Height="3"
           VerticalAlignment="Bottom"
           Fill="Transparent"
           Cursor="SizeNS"
           MouseLeftButtonDown="ResizeBorder_MouseLeftButtonDown"
           Tag="Bottom"/>

<!-- Bottom-Left Corner -->
<Rectangle x:Name="ResizeBottomLeft"
           Grid.Row="2"
           Width="8" Height="8"
           HorizontalAlignment="Left"
           VerticalAlignment="Bottom"
           Fill="Transparent"
           Cursor="SizeNESW"
           MouseLeftButtonDown="ResizeBorder_MouseLeftButtonDown"
           Tag="BottomLeft"/>

<!-- Bottom-Right Corner -->
<Rectangle x:Name="ResizeBottomRight"
           Grid.Row="2"
           Width="8" Height="8"
           HorizontalAlignment="Right"
           VerticalAlignment="Bottom"
           Fill="Transparent"
           Cursor="SizeNWSE"
           MouseLeftButtonDown="ResizeBorder_MouseLeftButtonDown"
           Tag="BottomRight"/>
```

### Resize Event Handler (MainWindow.xaml.cs)

```csharp
// Resize directions for WM_SYSCOMMAND
private const int SC_SIZE_LEFT = 0xF001;
private const int SC_SIZE_RIGHT = 0xF002;
private const int SC_SIZE_TOP = 0xF003;
private const int SC_SIZE_TOPLEFT = 0xF004;
private const int SC_SIZE_TOPRIGHT = 0xF005;
private const int SC_SIZE_BOTTOM = 0xF006;
private const int SC_SIZE_BOTTOMLEFT = 0xF007;
private const int SC_SIZE_BOTTOMRIGHT = 0xF008;

private const int WM_SYSCOMMAND = 0x0112;

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
```

### Current Configuration

| Element | Size | Purpose |
|---------|------|---------|
| WebView2 Margin | 3px all sides | Exposes resize areas around browser content |
| Edge Rectangles | 3px width/height | Clickable resize zones |
| Corner Rectangles | 8x8px | Larger target for diagonal resize |
| ResizeBorderWidth constant | 3px | For WM_NCHITTEST calculations |

---

## Win32 Message Handling

### Message Hook Setup

```csharp
private void MainWindow_SourceInitialized(object? sender, EventArgs e)
{
    var handle = new WindowInteropHelper(this).Handle;
    var source = HwndSource.FromHwnd(handle);
    source?.AddHook(WindowProc);
}
```

### WindowProc Handler

```csharp
private IntPtr WindowProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
{
    // WM_NCCALCSIZE: Remove non-client area (eliminates white border)
    if (msg == WM_NCCALCSIZE && wParam != IntPtr.Zero)
    {
        handled = true;
        return IntPtr.Zero;
    }

    // WM_NCACTIVATE: Prevent inactive window frame drawing
    else if (msg == WM_NCACTIVATE)
    {
        handled = true;
        return new IntPtr(1);
    }

    // WM_NCPAINT: Prevent non-client area painting
    else if (msg == WM_NCPAINT)
    {
        handled = true;
        return IntPtr.Zero;
    }

    // WM_GETMINMAXINFO: Handle maximize to respect taskbar
    else if (msg == WM_GETMINMAXINFO && !_isFullScreen)
    {
        WmGetMinMaxInfo(hwnd, lParam);
        handled = true;
    }

    // WM_NCHITTEST: Custom resize border hit testing
    else if (msg == WM_NCHITTEST && WindowState == WindowState.Normal && !_isFullScreen)
    {
        var result = HitTestForResize(lParam);
        if (result != HTCLIENT)
        {
            handled = true;
            return new IntPtr(result);
        }
    }

    return IntPtr.Zero;
}
```

### HitTestForResize Implementation

```csharp
private const int ResizeBorderWidth = 3;

[DllImport("user32.dll")]
private static extern bool GetWindowRect(IntPtr hwnd, out RECT lpRect);

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

    // Use border width in physical pixels
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
```

---

## Known Issues and Solutions

### Issue 1: White Border at Window Top

**Problem**: A thin white/gray border appears at the top of the window.

**Solution**: Handle `WM_NCCALCSIZE` to remove the non-client area:
```csharp
if (msg == WM_NCCALCSIZE && wParam != IntPtr.Zero)
{
    handled = true;
    return IntPtr.Zero;
}
```

Also ensure:
- Window `Background="#000000"`
- Root Grid `Background="Black"`
- TitleBar Grid `Background="Black"`

### Issue 2: White Border When Window Loses Focus

**Problem**: A white border appears around the header when clicking outside the browser.

**Solution**: Handle `WM_NCACTIVATE` and `WM_NCPAINT`:
```csharp
else if (msg == WM_NCACTIVATE)
{
    handled = true;
    return new IntPtr(1);  // Return TRUE to prevent default frame drawing
}
else if (msg == WM_NCPAINT)
{
    handled = true;
    return IntPtr.Zero;
}
```

### Issue 3: Resize Not Working on Window Edges

**Problem**: Window cannot be resized from left, right, or bottom edges.

**Root Cause**: WebView2 uses a separate HWND that intercepts all mouse messages.

**Solution**:
1. Add margin to WebView2: `Margin = new Thickness(3, 3, 3, 3)`
2. Add invisible Rectangle elements at edges that handle `MouseLeftButtonDown`
3. Use `WM_SYSCOMMAND` with `SC_SIZE_*` constants to trigger native resize

### Issue 4: Resize Border Too Precise

**Problem**: Users have to be exactly on the 1px edge to trigger resize.

**Solution**: Increase the values:
- Increase `ResizeBorderWidth` constant
- Increase WebView2 margin
- Increase Rectangle widths/heights

Current recommended minimum: 3px for edges, 8px for corners.

### Issue 5: Application Doesn't Display After WM_NCCALCSIZE

**Problem**: After adding `WM_NCCALCSIZE` handling, the window doesn't render.

**Solution**: Ensure proper return values:
- Set `handled = true`
- Return `IntPtr.Zero`
- Only handle when `wParam != IntPtr.Zero`

---

## File Locations

| File | Purpose |
|------|---------|
| `MainWindow.xaml` | UI layout including resize rectangles |
| `MainWindow.xaml.cs` | Win32 interop, resize handling, window message processing |

## Constants Reference

```csharp
// Window messages
private const int WM_GETMINMAXINFO = 0x0024;
private const int WM_NCHITTEST = 0x0084;
private const int WM_NCCALCSIZE = 0x0083;
private const int WM_NCACTIVATE = 0x0086;
private const int WM_NCPAINT = 0x0085;
private const int WM_SYSCOMMAND = 0x0112;

// Hit test results
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
```

---

## World Wide Bible Web (WWBW) DNS Resolution System

### Overview

The browser implements a dual-layered DNS resolution system that maps internal private protocol addresses to public URL equivalents. This allows the World Wide Bible Web to function as both a closed covenant network and an externally accessible platform.

### Private Protocol URLs

Private protocol URLs follow this format:
```
{type}://{domain}.{type}
```

Examples:
- `inspire://home.inspire` → resolves to `https://www.jubileeverse.com`
- `webspace://jubileeverse.webspace` → resolves to `https://www.jubileeverse.com`
- `webspace://trumplicated.webspace` → resolves to `https://www.trumplicated.com`

### Supported Protocol Types

| Protocol | Abbreviation | Description |
|----------|--------------|-------------|
| inspire | insp | Inspirational content and spiritual resources |
| apostle | apos | Apostolic ministry and leadership content |
| webspace | webs | General web spaces and community platforms |
| church | chur | Church and congregation web spaces |
| prophet | prop | Prophetic ministry content |

### Browser Mode Behavior

#### WWBW Mode (JubileeBibles)
- **Only private protocol URLs are allowed** (inspire://, webspace://, etc.)
- Regular URLs (https://, http://) are blocked with an informative error page
- Address bar displays the private protocol URL, not the resolved public URL
- Blacklist checking still applies to the resolved public URL

#### WWW Mode (Internet)
- **Both private protocol URLs and regular URLs are allowed**
- Private protocol URLs are resolved to their public equivalents
- Address bar displays the actual URL being visited

### Key Files

| File | Purpose |
|------|---------|
| `Services/WWBWDnsResolver.cs` | DNS resolution service connecting to PostgreSQL |
| `MainWindow.xaml.cs` | Navigation logic and URL handling |

### WWBWDnsResolver Service

```csharp
// Check if URL is a private protocol
bool isPrivate = WWBWDnsResolver.IsPrivateProtocol("inspire://home.inspire"); // true

// Check if URL is valid for current mode
bool isValid = _dnsResolver.IsValidForMode(url, BrowserMode.JubileeBibles);

// Resolve private URL to public URL
string? publicUrl = await _dnsResolver.ResolveToPublicUrlAsync("inspire://home.inspire");
// Returns: "https://www.jubileeverse.com"

// Reverse resolve public URL to private URL
string? privateUrl = await _dnsResolver.ReverseResolveAsync("https://www.jubileeverse.com");
// Returns: "inspire://home.inspire"
```

### Database Connection

The DNS resolver connects to the PostgreSQL database:
- **Database**: WorldWideBibleWeb
- **Default Connection**: `Host=localhost;Port=5432;Database=WorldWideBibleWeb;Username=postgres;Password=postgres`

### Caching

The resolver maintains an in-memory cache with:
- Forward cache: Private URL → Resolution Result
- Reverse cache: Public URL → Resolution Result
- Cache expiry: 5 minutes
- Manual refresh: `await _dnsResolver.RefreshAsync()`

### Resolution Flow

```
User enters URL
       │
       ▼
┌──────────────────┐
│ Is Private URL?  │
└────────┬─────────┘
         │
    Yes  │  No
    ▼    │  ▼
┌────────┴────┐     ┌─────────────────┐
│ WWBW Mode?  │     │ Valid for Mode? │
└─────┬───────┘     └────────┬────────┘
      │                      │
  Yes │ No               Yes │ No
  ▼   │ ▼                ▼   │ ▼
┌─────┴────────────┐  ┌──────┴───────┐
│ Resolve via DNS  │  │ Block w/Error│
└────────┬─────────┘  └──────────────┘
         │
         ▼
┌──────────────────┐
│ Check Blacklist  │
└────────┬─────────┘
         │
    OK   │ Blocked
    ▼    │ ▼
┌────────┴────────┐
│ Navigate to URL │
└─────────────────┘
```

### Address Bar Display

In WWBW mode, the address bar shows the original private protocol URL instead of the resolved public URL:

```csharp
// When navigation completes in WWBW mode:
// 1. Check if we have a stored private URL mapping
// 2. If not, try to reverse resolve the public URL
// 3. Display the private URL in the address bar
```

---

## Future Considerations

1. **WebView2CompositionControl**: Microsoft has introduced this control to solve the airspace problem. It renders through WPF's composition system instead of a separate HWND. However, it has performance overhead and DRM content issues.

2. **DPI Scaling**: The current implementation uses physical pixels from `GetWindowRect`. If DPI issues arise, consider using `PresentationSource.FromVisual(this).CompositionTarget.TransformToDevice` to scale values appropriately.

3. **Per-Monitor DPI**: For per-monitor DPI awareness, additional handling may be needed in `WM_DPICHANGED`.

4. **DNS Cache Optimization**: Consider implementing a persistent cache to reduce database queries on browser startup.

5. **Additional Protocol Types**: New web space types can be added by:
   - Adding entries to the `WebSpaceTypes` table
   - Adding the protocol to `WWBWDnsResolver.PrivateProtocols` HashSet
   - Running `SELECT refresh_dns_cache()` in PostgreSQL
