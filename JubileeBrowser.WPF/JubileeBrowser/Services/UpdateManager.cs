using System.Net.Http;
using System.Reflection;
using Newtonsoft.Json;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class UpdateManager
{
    private const string UpdateEndpoint = "https://updates.jubileebrowser.com/releases";
    private const int CheckIntervalHours = 4;
    private const int InitialDelaySeconds = 30;

    private readonly string _updateLogPath;
    private readonly string _updateStatePath;
    private readonly HttpClient _httpClient;

    private UpdateState _state = new();
    private System.Timers.Timer? _checkTimer;

    public event EventHandler<UpdateState>? StateChanged;
    public event EventHandler<UpdateProgress>? DownloadProgress;

    public UpdateState State => _state;

    public UpdateManager()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);

        _updateLogPath = Path.Combine(appDataPath, "update.log");
        _updateStatePath = Path.Combine(appDataPath, "update-state.json");

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(UpdateEndpoint)
        };

        _state.CurrentVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
    }

    public async Task InitializeAsync()
    {
        await LoadStateAsync();
        StartAutoUpdateCheck();
    }

    private async Task LoadStateAsync()
    {
        try
        {
            if (File.Exists(_updateStatePath))
            {
                var json = await File.ReadAllTextAsync(_updateStatePath);
                var loaded = JsonConvert.DeserializeObject<UpdateState>(json);
                if (loaded != null)
                {
                    _state.Channel = loaded.Channel;
                    _state.LastCheckTime = loaded.LastCheckTime;
                }
            }
        }
        catch (Exception ex)
        {
            Log($"Error loading update state: {ex.Message}");
        }
    }

    private async Task SaveStateAsync()
    {
        try
        {
            var json = JsonConvert.SerializeObject(_state, Formatting.Indented);
            await File.WriteAllTextAsync(_updateStatePath, json);
        }
        catch (Exception ex)
        {
            Log($"Error saving update state: {ex.Message}");
        }
    }

    private void StartAutoUpdateCheck()
    {
        // Initial check after delay
        Task.Delay(TimeSpan.FromSeconds(InitialDelaySeconds)).ContinueWith(async _ =>
        {
            await CheckForUpdatesAsync();
        });

        // Periodic checks
        _checkTimer = new System.Timers.Timer(TimeSpan.FromHours(CheckIntervalHours).TotalMilliseconds);
        _checkTimer.Elapsed += async (s, e) =>
        {
            await CheckForUpdatesAsync();
        };
        _checkTimer.Start();
    }

    public async Task<UpdateState> CheckForUpdatesAsync()
    {
        try
        {
            _state.Status = UpdateStatus.Checking;
            OnStateChanged();

            Log("Checking for updates...");

            var channel = _state.Channel == UpdateChannel.Beta ? "beta" : "stable";
            var response = await _httpClient.GetAsync($"/{channel}/releases.json");

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"Failed to check for updates: {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();
            var releases = JsonConvert.DeserializeObject<ReleaseInfo[]>(content);

            if (releases?.Length > 0)
            {
                var latest = releases[0];
                var currentVersion = new Version(_state.CurrentVersion);
                var latestVersion = new Version(latest.Version);

                if (latestVersion > currentVersion)
                {
                    _state.Status = UpdateStatus.Available;
                    _state.AvailableVersion = latest.Version;
                    _state.ReleaseNotes = latest.ReleaseNotes;
                    Log($"Update available: {latest.Version}");
                }
                else
                {
                    _state.Status = UpdateStatus.NotAvailable;
                    Log("No update available");
                }
            }
            else
            {
                _state.Status = UpdateStatus.NotAvailable;
            }

            _state.LastCheckTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _state.LastError = null;

            await SaveStateAsync();
            OnStateChanged();

            return _state;
        }
        catch (Exception ex)
        {
            Log($"Error checking for updates: {ex.Message}");
            _state.Status = UpdateStatus.Error;
            _state.LastError = ex.Message;
            OnStateChanged();
            return _state;
        }
    }

    public async Task DownloadUpdateAsync()
    {
        try
        {
            if (_state.Status != UpdateStatus.Available || string.IsNullOrEmpty(_state.AvailableVersion))
            {
                throw new Exception("No update available to download");
            }

            _state.Status = UpdateStatus.Downloading;
            _state.DownloadProgress = 0;
            OnStateChanged();

            Log($"Downloading update {_state.AvailableVersion}...");

            var channel = _state.Channel == UpdateChannel.Beta ? "beta" : "stable";
            var fileName = $"JubileeBrowser-{_state.AvailableVersion}-Setup.exe";
            var downloadUrl = $"/{channel}/{fileName}";

            using var response = await _httpClient.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength ?? -1;
            var downloadPath = Path.Combine(Path.GetTempPath(), fileName);

            using var contentStream = await response.Content.ReadAsStreamAsync();
            using var fileStream = new FileStream(downloadPath, FileMode.Create, FileAccess.Write);

            var buffer = new byte[8192];
            var totalBytesRead = 0L;
            var lastProgressUpdate = DateTime.UtcNow;
            var lastBytesRead = 0L;
            int bytesRead;

            while ((bytesRead = await contentStream.ReadAsync(buffer, 0, buffer.Length)) != 0)
            {
                await fileStream.WriteAsync(buffer, 0, bytesRead);
                totalBytesRead += bytesRead;

                var now = DateTime.UtcNow;
                if ((now - lastProgressUpdate).TotalMilliseconds >= 250)
                {
                    var bytesPerSecond = (totalBytesRead - lastBytesRead) / (now - lastProgressUpdate).TotalSeconds;
                    lastBytesRead = totalBytesRead;
                    lastProgressUpdate = now;

                    _state.DownloadProgress = totalBytes > 0 ? (double)totalBytesRead / totalBytes * 100 : 0;

                    DownloadProgress?.Invoke(this, new UpdateProgress
                    {
                        Percent = _state.DownloadProgress ?? 0,
                        BytesPerSecond = bytesPerSecond,
                        Transferred = totalBytesRead,
                        Total = totalBytes
                    });
                }
            }

            _state.Status = UpdateStatus.Downloaded;
            _state.DownloadProgress = 100;
            OnStateChanged();

            Log($"Update downloaded to {downloadPath}");
        }
        catch (Exception ex)
        {
            Log($"Error downloading update: {ex.Message}");
            _state.Status = UpdateStatus.Error;
            _state.LastError = ex.Message;
            OnStateChanged();
            throw;
        }
    }

    public void SetChannel(UpdateChannel channel)
    {
        _state.Channel = channel;
        _ = SaveStateAsync();
    }

    private void Log(string message)
    {
        try
        {
            var logLine = $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}] {message}\n";
            File.AppendAllText(_updateLogPath, logLine);
        }
        catch
        {
            // Ignore logging errors
        }
    }

    private void OnStateChanged()
    {
        StateChanged?.Invoke(this, _state);
    }
}

public class ReleaseInfo
{
    public string Version { get; set; } = string.Empty;
    public string? ReleaseNotes { get; set; }
    public DateTime ReleaseDate { get; set; }
    public string? DownloadUrl { get; set; }
    public long FileSize { get; set; }
    public string? Sha256 { get; set; }
}
