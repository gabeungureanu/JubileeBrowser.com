namespace JubileeBrowser.Models;

public class HomepageSettings
{
    public string Internet { get; set; } = "http://www.jubileeverse.com";
    public string JubileeBibles { get; set; } = "inspire://jubileeverse.webspace";
}

public class AutofillSettings
{
    public bool Passwords { get; set; } = true;
    public bool Addresses { get; set; } = true;
    public bool PaymentMethods { get; set; } = false;
}

public class PrivacySettings
{
    public bool ClearOnExit { get; set; }
    public bool DoNotTrack { get; set; } = true;
    public string CookieBehavior { get; set; } = "allow";
    public bool TrackingProtection { get; set; } = true;
    public bool SafeBrowsing { get; set; } = true;
}

public class PermissionDefaults
{
    public string Camera { get; set; } = "ask";
    public string Microphone { get; set; } = "ask";
    public string Location { get; set; } = "ask";
    public string Notifications { get; set; } = "allow";
    public string Popups { get; set; } = "block";
    public string JavaScript { get; set; } = "allow";
}

public class AppearanceSettings
{
    public string Theme { get; set; } = "dark";
    public int FontSize { get; set; } = 16;
    public double ZoomLevel { get; set; } = 1.0;
    public bool ShowBookmarksBar { get; set; }
}

public class SearchEngine
{
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? Keyword { get; set; }
}

public class SearchSettings
{
    public string DefaultEngine { get; set; } = "google";
    public List<SearchEngine> Engines { get; set; } = new()
    {
        new SearchEngine { Name = "Google", Url = "https://www.google.com/search?q={searchTerms}", Keyword = "g" },
        new SearchEngine { Name = "Bing", Url = "https://www.bing.com/search?q={searchTerms}", Keyword = "b" },
        new SearchEngine { Name = "DuckDuckGo", Url = "https://duckduckgo.com/?q={searchTerms}", Keyword = "d" }
    };
    public bool SuggestionsEnabled { get; set; } = true;
}

public class StartupSettings
{
    public string Internet { get; set; } = "homepage";
    public string JubileeBibles { get; set; } = "homepage";
}

public class AdvancedSettings
{
    public string DownloadPath { get; set; } = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\Downloads";
    public bool AskDownloadLocation { get; set; }
    public string Language { get; set; } = "en-US";
    public bool Spellcheck { get; set; } = true;
    public bool HardwareAcceleration { get; set; } = true;
    public bool BackgroundApps { get; set; }
}

public class BrowserSettings
{
    public BrowserMode DefaultMode { get; set; } = BrowserMode.Internet;
    public HomepageSettings Homepage { get; set; } = new();
    public AutofillSettings Autofill { get; set; } = new();
    public PrivacySettings Privacy { get; set; } = new();
    public PermissionDefaults Permissions { get; set; } = new();
    public AppearanceSettings Appearance { get; set; } = new();
    public SearchSettings Search { get; set; } = new();
    public StartupSettings Startup { get; set; } = new();
    public AdvancedSettings Advanced { get; set; } = new();
}
