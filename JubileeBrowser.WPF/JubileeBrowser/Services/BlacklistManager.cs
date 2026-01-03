using System.IO;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class BlacklistManager
{
    private const int MaxBlockLog = 1000;
    private readonly string _blacklistPath;
    private readonly List<BlockEvent> _blockLog = new();

    private HashSet<string> _blockedDomains = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _blockedKeywords = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _blockedUrls = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _allowlist = new(StringComparer.OrdinalIgnoreCase);

    private DateTime _lastModified = DateTime.MinValue;
    private FileSystemWatcher? _watcher;

    public BlacklistManager()
    {
        // Look for blacklist in app directory first, then in parent
        var appDir = AppDomain.CurrentDomain.BaseDirectory;
        _blacklistPath = Path.Combine(appDir, "blacklist.yaml");

        if (!File.Exists(_blacklistPath))
        {
            // Try parent directories (for development)
            var parentDir = Path.GetDirectoryName(appDir);
            while (parentDir != null)
            {
                var testPath = Path.Combine(parentDir, "blacklist.yaml");
                if (File.Exists(testPath))
                {
                    _blacklistPath = testPath;
                    break;
                }
                parentDir = Path.GetDirectoryName(parentDir);
            }
        }
    }

    public async Task InitializeAsync()
    {
        await LoadAsync();
        SetupFileWatcher();
    }

    public async Task LoadAsync()
    {
        try
        {
            if (!File.Exists(_blacklistPath))
            {
                System.Diagnostics.Debug.WriteLine("Blacklist file not found");
                return;
            }

            var fileInfo = new FileInfo(_blacklistPath);
            if (fileInfo.LastWriteTimeUtc == _lastModified)
                return;

            var yaml = await File.ReadAllTextAsync(_blacklistPath);

            var deserializer = new DeserializerBuilder()
                .IgnoreUnmatchedProperties()
                .Build();

            var blocklist = deserializer.Deserialize<BlacklistData>(yaml);

            if (blocklist != null)
            {
                // Support both "domains" and "blocked_sites" keys from YAML
                var domainList = blocklist.Domains ?? blocklist.BlockedSites ?? Enumerable.Empty<string>();
                _blockedDomains = new HashSet<string>(domainList, StringComparer.OrdinalIgnoreCase);

                _blockedKeywords = new HashSet<string>(
                    blocklist.Keywords ?? Enumerable.Empty<string>(),
                    StringComparer.OrdinalIgnoreCase);

                _blockedUrls = new HashSet<string>(
                    blocklist.Urls ?? Enumerable.Empty<string>(),
                    StringComparer.OrdinalIgnoreCase);

                _allowlist = new HashSet<string>(
                    blocklist.Allowlist ?? Enumerable.Empty<string>(),
                    StringComparer.OrdinalIgnoreCase);
            }

            _lastModified = fileInfo.LastWriteTimeUtc;

            System.Diagnostics.Debug.WriteLine(
                $"Blacklist loaded: {_blockedDomains.Count} domains, " +
                $"{_blockedKeywords.Count} keywords, {_blockedUrls.Count} URLs");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading blacklist: {ex.Message}");
        }
    }

    private void SetupFileWatcher()
    {
        try
        {
            var directory = Path.GetDirectoryName(_blacklistPath);
            var filename = Path.GetFileName(_blacklistPath);

            if (directory == null) return;

            _watcher = new FileSystemWatcher(directory, filename)
            {
                NotifyFilter = NotifyFilters.LastWrite
            };

            _watcher.Changed += async (s, e) =>
            {
                // Wait a bit for file write to complete
                await Task.Delay(500);
                await LoadAsync();
            };

            _watcher.EnableRaisingEvents = true;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error setting up file watcher: {ex.Message}");
        }
    }

    public bool IsBlocked(string url, BrowserMode mode)
    {
        try
        {
            if (string.IsNullOrEmpty(url)) return false;

            var uri = new Uri(url);
            var domain = uri.Host.ToLowerInvariant();

            // Check allowlist first
            if (IsAllowed(domain)) return false;

            // Check exact domain match
            if (_blockedDomains.Contains(domain))
            {
                LogBlockEvent(url, domain, BlockMatchType.Exact, domain, mode);
                return true;
            }

            // Check subdomain matches
            var parts = domain.Split('.');
            for (int i = 1; i < parts.Length - 1; i++)
            {
                var parentDomain = string.Join('.', parts.Skip(i));
                if (_blockedDomains.Contains(parentDomain))
                {
                    LogBlockEvent(url, domain, BlockMatchType.Subdomain, parentDomain, mode);
                    return true;
                }
            }

            // Check URL patterns
            foreach (var pattern in _blockedUrls)
            {
                if (url.Contains(pattern, StringComparison.OrdinalIgnoreCase))
                {
                    LogBlockEvent(url, domain, BlockMatchType.Url, pattern, mode);
                    return true;
                }
            }

            // Check keywords in URL
            foreach (var keyword in _blockedKeywords)
            {
                if (url.Contains(keyword, StringComparison.OrdinalIgnoreCase))
                {
                    LogBlockEvent(url, domain, BlockMatchType.Keyword, keyword, mode);
                    return true;
                }
            }

            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error checking blacklist: {ex.Message}");
            return false;
        }
    }

    private bool IsAllowed(string domain)
    {
        if (_allowlist.Contains(domain)) return true;

        var parts = domain.Split('.');
        for (int i = 1; i < parts.Length - 1; i++)
        {
            var parentDomain = string.Join('.', parts.Skip(i));
            if (_allowlist.Contains(parentDomain)) return true;
        }

        return false;
    }

    private void LogBlockEvent(string url, string domain, BlockMatchType matchType, string pattern, BrowserMode mode)
    {
        var blockEvent = new BlockEvent
        {
            Timestamp = DateTime.UtcNow,
            Url = url,
            Domain = domain,
            MatchType = matchType,
            MatchedPattern = pattern,
            BrowserMode = mode
        };

        _blockLog.Insert(0, blockEvent);

        if (_blockLog.Count > MaxBlockLog)
        {
            _blockLog.RemoveRange(MaxBlockLog, _blockLog.Count - MaxBlockLog);
        }
    }

    public IReadOnlyList<BlockEvent> GetBlockLog()
    {
        return _blockLog.AsReadOnly();
    }

    public void ClearBlockLog()
    {
        _blockLog.Clear();
    }

    public (int Domains, int Keywords, int Urls) GetStats()
    {
        return (_blockedDomains.Count, _blockedKeywords.Count, _blockedUrls.Count);
    }
}

public class BlacklistData
{
    public List<string>? Domains { get; set; }
    [YamlDotNet.Serialization.YamlMember(Alias = "blocked_sites")]
    public List<string>? BlockedSites { get; set; }
    public List<string>? Keywords { get; set; }
    public List<string>? Urls { get; set; }
    public List<string>? Allowlist { get; set; }
    public BlacklistMetadata? Metadata { get; set; }
}

public class BlacklistMetadata
{
    public string? FetchedAt { get; set; }
    public int DomainCount { get; set; }
    public List<string>? Sources { get; set; }
}
