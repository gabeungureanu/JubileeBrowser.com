using Microsoft.Web.WebView2.Core;
using System.Reflection;

namespace JubileeBrowser.Services;

public class InternalPageHandler
{
    private readonly Dictionary<string, Func<string?, string>> _pageGenerators = new();

    public InternalPageHandler()
    {
        RegisterDefaultPages();
    }

    private void RegisterDefaultPages()
    {
        _pageGenerators["settings"] = GenerateSettingsPage;
        _pageGenerators["about"] = GenerateAboutPage;
        _pageGenerators["blocked"] = GenerateBlockedPage;
        _pageGenerators["error"] = GenerateErrorPage;
        _pageGenerators["welcome"] = GenerateWelcomePage;
    }

    public bool CanHandle(string url)
    {
        return url.StartsWith("jubilee://", StringComparison.OrdinalIgnoreCase);
    }

    public string GetPageContent(string url)
    {
        try
        {
            var uri = new Uri(url);
            var pageName = uri.Host.ToLowerInvariant();
            var query = uri.Query;

            if (_pageGenerators.TryGetValue(pageName, out var generator))
            {
                return generator(query);
            }

            return Generate404Page(pageName);
        }
        catch
        {
            return GenerateErrorPage("Invalid URL");
        }
    }

    public async Task NavigateToInternalPage(CoreWebView2 webView, string url)
    {
        var content = GetPageContent(url);
        webView.NavigateToString(content);
    }

    private string GenerateSettingsPage(string? query)
    {
        var section = "general";
        if (!string.IsNullOrEmpty(query))
        {
            var parsed = System.Web.HttpUtility.ParseQueryString(query);
            section = parsed["section"] ?? "general";
        }

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Settings - Jubilee Browser</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #ffffff;
            min-height: 100vh;
        }}
        .container {{
            display: flex;
            max-width: 1200px;
            margin: 0 auto;
        }}
        .sidebar {{
            width: 250px;
            background: #16213e;
            min-height: 100vh;
            padding: 20px 0;
        }}
        .sidebar h2 {{
            padding: 10px 20px;
            margin-bottom: 10px;
            font-size: 18px;
            color: #e94560;
        }}
        .sidebar a {{
            display: block;
            padding: 12px 20px;
            color: #a0a0a0;
            text-decoration: none;
            transition: all 0.2s;
        }}
        .sidebar a:hover, .sidebar a.active {{
            background: #1a1a2e;
            color: #ffffff;
        }}
        .content {{
            flex: 1;
            padding: 40px;
        }}
        .content h1 {{
            margin-bottom: 30px;
            font-size: 28px;
            font-weight: 300;
        }}
        .setting-group {{
            background: #16213e;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }}
        .setting-group h3 {{
            margin-bottom: 15px;
            color: #e94560;
            font-size: 14px;
            text-transform: uppercase;
        }}
        .setting-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #2a2a4e;
        }}
        .setting-row:last-child {{
            border-bottom: none;
        }}
        .setting-label {{
            display: flex;
            flex-direction: column;
        }}
        .setting-label span {{
            color: #a0a0a0;
            font-size: 12px;
            margin-top: 4px;
        }}
        input[type='text'], select {{
            background: #1a1a2e;
            border: 1px solid #2a2a4e;
            padding: 8px 12px;
            border-radius: 4px;
            color: #ffffff;
            min-width: 200px;
        }}
        .toggle {{
            width: 50px;
            height: 26px;
            background: #2a2a4e;
            border-radius: 13px;
            position: relative;
            cursor: pointer;
        }}
        .toggle.active {{
            background: #e94560;
        }}
        .toggle::after {{
            content: '';
            position: absolute;
            width: 22px;
            height: 22px;
            background: white;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            transition: transform 0.2s;
        }}
        .toggle.active::after {{
            transform: translateX(24px);
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='sidebar'>
            <h2>Settings</h2>
            <a href='jubilee://settings?section=general' class='{(section == "general" ? "active" : "")}'>General</a>
            <a href='jubilee://settings?section=appearance' class='{(section == "appearance" ? "active" : "")}'>Appearance</a>
            <a href='jubilee://settings?section=privacy' class='{(section == "privacy" ? "active" : "")}'>Privacy & Security</a>
            <a href='jubilee://settings?section=search' class='{(section == "search" ? "active" : "")}'>Search</a>
            <a href='jubilee://settings?section=startup' class='{(section == "startup" ? "active" : "")}'>On Startup</a>
            <a href='jubilee://settings?section=downloads' class='{(section == "downloads" ? "active" : "")}'>Downloads</a>
            <a href='jubilee://settings?section=advanced' class='{(section == "advanced" ? "active" : "")}'>Advanced</a>
            <a href='jubilee://about'>About</a>
        </div>
        <div class='content'>
            <h1>Settings</h1>
            <div class='setting-group'>
                <h3>Homepage</h3>
                <div class='setting-row'>
                    <div class='setting-label'>
                        Internet Mode Homepage
                        <span>The page shown when you open a new tab in Internet mode</span>
                    </div>
                    <input type='text' value='https://www.google.com' />
                </div>
                <div class='setting-row'>
                    <div class='setting-label'>
                        Jubilee Bibles Homepage
                        <span>The page shown when you open a new tab in Jubilee Bibles mode</span>
                    </div>
                    <input type='text' value='https://jubileebibles.com' />
                </div>
            </div>
            <div class='setting-group'>
                <h3>Default Mode</h3>
                <div class='setting-row'>
                    <div class='setting-label'>
                        Start in Jubilee Bibles mode
                        <span>Opens new windows in Jubilee Bibles mode by default</span>
                    </div>
                    <div class='toggle' onclick='this.classList.toggle(""active"")'></div>
                </div>
            </div>
        </div>
    </div>
    <script>
        // Settings interaction logic
        document.querySelectorAll('.toggle').forEach(toggle => {{
            toggle.addEventListener('click', function() {{
                window.jubilee?.send('settings:update', {{
                    setting: this.dataset.setting,
                    value: this.classList.contains('active')
                }});
            }});
        }});
    </script>
</body>
</html>";
    }

    private string GenerateAboutPage(string? query)
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>About - Jubilee Browser</title>
    <style>
        body {{
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }}
        .about-card {{
            background: #16213e;
            border-radius: 16px;
            padding: 60px;
            text-align: center;
            max-width: 500px;
        }}
        .logo {{
            width: 100px;
            height: 100px;
            background: linear-gradient(135deg, #e94560, #E6AC00);
            border-radius: 20px;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
        }}
        h1 {{
            margin-bottom: 10px;
            font-weight: 300;
        }}
        .version {{
            color: #e94560;
            font-size: 18px;
            margin-bottom: 20px;
        }}
        .description {{
            color: #a0a0a0;
            line-height: 1.6;
            margin-bottom: 30px;
        }}
        .tech {{
            background: #1a1a2e;
            padding: 15px;
            border-radius: 8px;
            font-size: 14px;
            color: #a0a0a0;
        }}
        .tech strong {{
            color: #ffffff;
        }}
    </style>
</head>
<body>
    <div class='about-card'>
        <div class='logo'>J</div>
        <h1>Jubilee Browser</h1>
        <div class='version'>Version {version}</div>
        <p class='description'>
            A secure, family-friendly web browser with dual browsing modes.
            Browse the web safely with built-in content filtering and
            seamless access to Jubilee Bibles resources.
        </p>
        <div class='tech'>
            <strong>Powered by</strong> WebView2 (Microsoft Edge)<br>
            <strong>Built with</strong> WPF (.NET 8)
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateBlockedPage(string? query)
    {
        var url = "";
        var reason = "Content blocked by filter";

        if (!string.IsNullOrEmpty(query))
        {
            var parsed = System.Web.HttpUtility.ParseQueryString(query);
            url = parsed["url"] ?? "";
            reason = parsed["reason"] ?? reason;
        }

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Blocked - Jubilee Browser</title>
    <style>
        body {{
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }}
        .blocked-card {{
            text-align: center;
            padding: 40px;
        }}
        .icon {{
            font-size: 80px;
            margin-bottom: 20px;
        }}
        h1 {{
            color: #e94560;
            margin-bottom: 10px;
        }}
        p {{
            color: #a0a0a0;
            margin-bottom: 20px;
        }}
        .url {{
            background: #16213e;
            padding: 15px 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
            max-width: 500px;
        }}
        .back-btn {{
            display: inline-block;
            margin-top: 30px;
            padding: 12px 24px;
            background: #e94560;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            cursor: pointer;
        }}
        .back-btn:hover {{
            background: #d13a55;
        }}
    </style>
</head>
<body>
    <div class='blocked-card'>
        <div class='icon'>🚫</div>
        <h1>Content Blocked</h1>
        <p>{System.Web.HttpUtility.HtmlEncode(reason)}</p>
        <div class='url'>{System.Web.HttpUtility.HtmlEncode(url)}</div>
        <a class='back-btn' onclick='history.back()'>Go Back</a>
    </div>
</body>
</html>";
    }

    private string GenerateErrorPage(string? query)
    {
        var errorMessage = query ?? "An error occurred";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Error - Jubilee Browser</title>
    <style>
        body {{
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }}
        .error-card {{
            text-align: center;
            padding: 40px;
        }}
        .icon {{
            font-size: 80px;
            margin-bottom: 20px;
        }}
        h1 {{
            color: #e94560;
            margin-bottom: 10px;
        }}
        p {{
            color: #a0a0a0;
        }}
    </style>
</head>
<body>
    <div class='error-card'>
        <div class='icon'>⚠️</div>
        <h1>Error</h1>
        <p>{System.Web.HttpUtility.HtmlEncode(errorMessage)}</p>
    </div>
</body>
</html>";
    }

    private string GenerateWelcomePage(string? query)
    {
        return @"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Welcome - Jubilee Browser</title>
    <style>
        body {
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        .welcome {
            text-align: center;
        }
        h1 {
            font-size: 48px;
            font-weight: 300;
            margin-bottom: 20px;
        }
        p {
            color: #a0a0a0;
            font-size: 18px;
        }
        .logo {
            width: 120px;
            height: 120px;
            background: linear-gradient(135deg, #e94560, #E6AC00);
            border-radius: 24px;
            margin: 0 auto 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 64px;
        }
    </style>
</head>
<body>
    <div class='welcome'>
        <div class='logo'>J</div>
        <h1>Welcome to Jubilee Browser</h1>
        <p>A secure, family-friendly browsing experience</p>
    </div>
</body>
</html>";
    }

    private string Generate404Page(string pageName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Not Found - Jubilee Browser</title>
    <style>
        body {{
            font-family: 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }}
        .error-card {{
            text-align: center;
            padding: 40px;
        }}
        .code {{
            font-size: 120px;
            font-weight: 300;
            color: #e94560;
        }}
        h1 {{
            margin-bottom: 10px;
        }}
        p {{
            color: #a0a0a0;
        }}
    </style>
</head>
<body>
    <div class='error-card'>
        <div class='code'>404</div>
        <h1>Page Not Found</h1>
        <p>The page 'jubilee://{System.Web.HttpUtility.HtmlEncode(pageName)}' does not exist.</p>
    </div>
</body>
</html>";
    }
}
