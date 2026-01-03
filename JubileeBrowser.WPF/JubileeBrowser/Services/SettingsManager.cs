using Newtonsoft.Json;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class SettingsManager
{
    private readonly string _settingsPath;
    private BrowserSettings _settings = new();

    public BrowserSettings Settings => _settings;

    public SettingsManager()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);
        _settingsPath = Path.Combine(appDataPath, "settings.json");
    }

    public async Task InitializeAsync()
    {
        await LoadAsync();
    }

    public async Task LoadAsync()
    {
        try
        {
            if (File.Exists(_settingsPath))
            {
                var json = await File.ReadAllTextAsync(_settingsPath);
                var loaded = JsonConvert.DeserializeObject<BrowserSettings>(json);
                if (loaded != null)
                {
                    _settings = loaded;
                    // Ensure all nested objects are not null (JSON may not have them)
                    EnsureSettingsNotNull();
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading settings: {ex.Message}");
            _settings = new BrowserSettings();
        }
    }

    private void EnsureSettingsNotNull()
    {
        // Ensure all nested settings objects are initialized
        _settings.Homepage ??= new HomepageSettings();
        _settings.Autofill ??= new AutofillSettings();
        _settings.Privacy ??= new PrivacySettings();
        _settings.Permissions ??= new PermissionDefaults();
        _settings.Appearance ??= new AppearanceSettings();
        _settings.Search ??= new SearchSettings();
        _settings.Startup ??= new StartupSettings();
        _settings.Advanced ??= new AdvancedSettings();
    }

    public async Task SaveAsync()
    {
        try
        {
            var json = JsonConvert.SerializeObject(_settings, Formatting.Indented);
            await File.WriteAllTextAsync(_settingsPath, json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving settings: {ex.Message}");
        }
    }

    public async Task UpdateAsync(Action<BrowserSettings> updateAction)
    {
        updateAction(_settings);
        await SaveAsync();
    }

    public T GetSection<T>(Func<BrowserSettings, T> selector)
    {
        return selector(_settings);
    }

    public async Task ResetAsync()
    {
        _settings = new BrowserSettings();
        await SaveAsync();
    }
}
