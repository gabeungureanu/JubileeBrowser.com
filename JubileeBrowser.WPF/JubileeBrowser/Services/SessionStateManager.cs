using Newtonsoft.Json;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class SessionStateManager
{
    private const int SessionExpirationDays = 7;
    private readonly string _sessionPath;
    private System.Timers.Timer? _saveTimer;
    private SessionState? _pendingSave;
    private readonly object _saveLock = new();

    public SessionStateManager()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);
        _sessionPath = Path.Combine(appDataPath, "session-state.json");
    }

    public async Task<SessionState?> LoadAsync()
    {
        try
        {
            if (!File.Exists(_sessionPath))
                return null;

            var json = await File.ReadAllTextAsync(_sessionPath);
            var state = JsonConvert.DeserializeObject<SessionState>(json);

            if (state == null)
                return null;

            // Ensure WindowBounds is not null
            state.WindowBounds ??= new WindowBounds();
            state.Tabs ??= new List<SessionTabState>();

            // Check if session has expired
            var expirationTime = DateTimeOffset.UtcNow.AddDays(-SessionExpirationDays).ToUnixTimeMilliseconds();
            if (state.Timestamp < expirationTime)
            {
                // Session expired, delete it
                File.Delete(_sessionPath);
                return null;
            }

            return state;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading session state: {ex.Message}");
            return null;
        }
    }

    public async Task SaveAsync(SessionState state)
    {
        // Debounce saves
        lock (_saveLock)
        {
            _pendingSave = state;
            _pendingSave.Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            if (_saveTimer == null)
            {
                _saveTimer = new System.Timers.Timer(1000);
                _saveTimer.Elapsed += async (s, e) =>
                {
                    _saveTimer?.Stop();
                    await FlushSaveAsync();
                };
                _saveTimer.AutoReset = false;
            }

            _saveTimer.Stop();
            _saveTimer.Start();
        }
    }

    public async Task SaveImmediateAsync(SessionState state)
    {
        lock (_saveLock)
        {
            _pendingSave = null;
            _saveTimer?.Stop();
        }

        try
        {
            state.Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var json = JsonConvert.SerializeObject(state, Formatting.Indented);
            await File.WriteAllTextAsync(_sessionPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving session state: {ex.Message}");
        }
    }

    /// <summary>
    /// Synchronous save for use during application shutdown to avoid async deadlocks.
    /// </summary>
    public void SaveImmediateSync(SessionState state)
    {
        lock (_saveLock)
        {
            _pendingSave = null;
            _saveTimer?.Stop();
        }

        try
        {
            state.Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var json = JsonConvert.SerializeObject(state, Formatting.Indented);
            File.WriteAllText(_sessionPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving session state: {ex.Message}");
        }
    }

    private async Task FlushSaveAsync()
    {
        SessionState? stateToSave;
        lock (_saveLock)
        {
            stateToSave = _pendingSave;
            _pendingSave = null;
        }

        if (stateToSave == null) return;

        try
        {
            var json = JsonConvert.SerializeObject(stateToSave, Formatting.Indented);
            await File.WriteAllTextAsync(_sessionPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving session state: {ex.Message}");
        }
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_sessionPath))
            {
                File.Delete(_sessionPath);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error clearing session state: {ex.Message}");
        }
    }
}
