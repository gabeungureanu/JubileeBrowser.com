using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class WebViewBridge
{
    private readonly CoreWebView2 _webView;
    private readonly Dictionary<string, Func<JObject, Task<object?>>> _handlers = new();

    public event EventHandler<string>? NavigationRequested;
    public event EventHandler<TabState>? TabCreationRequested;
    public event EventHandler? BookmarkRequested;

    public WebViewBridge(CoreWebView2 webView)
    {
        _webView = webView;
        _webView.WebMessageReceived += OnWebMessageReceived;

        RegisterDefaultHandlers();
    }

    private void RegisterDefaultHandlers()
    {
        // Navigation handlers
        RegisterHandler("nav:go", async args =>
        {
            var url = args["url"]?.ToString();
            if (!string.IsNullOrEmpty(url))
            {
                NavigationRequested?.Invoke(this, url);
            }
            return null;
        });

        // Tab handlers
        RegisterHandler("tab:create", async args =>
        {
            var url = args["url"]?.ToString() ?? string.Empty;
            TabCreationRequested?.Invoke(this, new TabState { Url = url });
            return null;
        });

        // Bookmark handler
        RegisterHandler("bookmark:toggle", async args =>
        {
            BookmarkRequested?.Invoke(this, EventArgs.Empty);
            return null;
        });
    }

    public void RegisterHandler(string channel, Func<JObject, Task<object?>> handler)
    {
        _handlers[channel] = handler;
    }

    public async Task<T?> InvokeAsync<T>(string channel, object? data = null)
    {
        var message = new
        {
            channel,
            data,
            id = Guid.NewGuid().ToString()
        };

        var json = JsonConvert.SerializeObject(message);
        var script = $"window.dispatchEvent(new CustomEvent('jubilee-message', {{ detail: {json} }}));";

        await _webView.ExecuteScriptAsync(script);
        return default;
    }

    public async Task SendAsync(string channel, object? data = null)
    {
        await InvokeAsync<object>(channel, data);
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var json = e.WebMessageAsJson;
            var message = JObject.Parse(json);

            var channel = message["channel"]?.ToString();
            var args = message["args"] as JObject ?? new JObject();
            var id = message["id"]?.ToString();

            if (string.IsNullOrEmpty(channel))
                return;

            object? result = null;
            string? error = null;

            if (_handlers.TryGetValue(channel, out var handler))
            {
                try
                {
                    result = await handler(args);
                }
                catch (Exception ex)
                {
                    error = ex.Message;
                }
            }
            else
            {
                error = $"Unknown channel: {channel}";
            }

            // Send response if there was an id
            if (!string.IsNullOrEmpty(id))
            {
                var response = new
                {
                    id,
                    result,
                    error
                };

                var responseJson = JsonConvert.SerializeObject(response);
                var script = $"window.dispatchEvent(new CustomEvent('jubilee-response', {{ detail: {responseJson} }}));";
                await _webView.ExecuteScriptAsync(script);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error handling web message: {ex.Message}");
        }
    }

    public async Task InjectBridgeScriptAsync()
    {
        const string bridgeScript = @"
(function() {
    if (window.jubilee) return;

    const pendingRequests = new Map();

    window.jubilee = {
        invoke: function(channel, args) {
            return new Promise((resolve, reject) => {
                const id = Math.random().toString(36).substr(2, 9);
                pendingRequests.set(id, { resolve, reject });

                window.chrome.webview.postMessage(JSON.stringify({
                    channel: channel,
                    args: args || {},
                    id: id
                }));

                setTimeout(() => {
                    if (pendingRequests.has(id)) {
                        pendingRequests.delete(id);
                        reject(new Error('Request timeout'));
                    }
                }, 30000);
            });
        },

        send: function(channel, args) {
            window.chrome.webview.postMessage(JSON.stringify({
                channel: channel,
                args: args || {}
            }));
        },

        on: function(channel, callback) {
            window.addEventListener('jubilee-message', function(e) {
                if (e.detail && e.detail.channel === channel) {
                    callback(e.detail.data);
                }
            });
        }
    };

    window.addEventListener('jubilee-response', function(e) {
        const response = e.detail;
        if (response.id && pendingRequests.has(response.id)) {
            const { resolve, reject } = pendingRequests.get(response.id);
            pendingRequests.delete(response.id);

            if (response.error) {
                reject(new Error(response.error));
            } else {
                resolve(response.result);
            }
        }
    });

    console.log('Jubilee Bridge initialized');
})();
";

        await _webView.AddScriptToExecuteOnDocumentCreatedAsync(bridgeScript);
    }
}
