using System.Text.Json;

namespace JubileeBrowser.UpdateAgent;

public class UpdateAgentOptions
{
    public string UpdateEndpoint { get; set; } = "https://updates.jubileebrowser.com/releases";
    public string Channel { get; set; } = "stable";
    public int CheckIntervalHours { get; set; } = 4;
    public int InitialDelaySeconds { get; set; } = 30;
    public int ApplyCheckIntervalMinutes { get; set; } = 5;
    public string? InstallRoot { get; set; }
    public string MainExecutableName { get; set; } = "JubileeBrowser.exe";
    public string? ExpectedCertificateThumbprint { get; set; }
    public string? SignaturePublicKeyPem { get; set; }

    public static UpdateAgentOptions Load()
    {
        var options = new UpdateAgentOptions();
        foreach (var path in GetConfigPaths())
        {
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                var json = File.ReadAllText(path);
                var loaded = JsonSerializer.Deserialize<UpdateAgentOptions>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (loaded != null)
                {
                    ApplyOverride(options, loaded);
                }
            }
            catch
            {
                // Ignore config parsing errors and keep defaults.
            }
        }

        return options;
    }

    private static IEnumerable<string> GetConfigPaths()
    {
        var baseDir = AppContext.BaseDirectory;
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        var programDataConfig = Path.Combine(programData, "JubileeBrowser", "update-agent.json");
        return new[]
        {
            Path.Combine(baseDir, "update-agent.json"),
            programDataConfig
        };
    }

    private static void ApplyOverride(UpdateAgentOptions target, UpdateAgentOptions source)
    {
        target.UpdateEndpoint = string.IsNullOrWhiteSpace(source.UpdateEndpoint) ? target.UpdateEndpoint : source.UpdateEndpoint;
        target.Channel = string.IsNullOrWhiteSpace(source.Channel) ? target.Channel : source.Channel;
        target.CheckIntervalHours = source.CheckIntervalHours > 0 ? source.CheckIntervalHours : target.CheckIntervalHours;
        target.InitialDelaySeconds = source.InitialDelaySeconds >= 0 ? source.InitialDelaySeconds : target.InitialDelaySeconds;
        target.ApplyCheckIntervalMinutes = source.ApplyCheckIntervalMinutes > 0 ? source.ApplyCheckIntervalMinutes : target.ApplyCheckIntervalMinutes;
        target.InstallRoot = string.IsNullOrWhiteSpace(source.InstallRoot) ? target.InstallRoot : source.InstallRoot;
        target.MainExecutableName = string.IsNullOrWhiteSpace(source.MainExecutableName) ? target.MainExecutableName : source.MainExecutableName;
        target.ExpectedCertificateThumbprint = string.IsNullOrWhiteSpace(source.ExpectedCertificateThumbprint)
            ? target.ExpectedCertificateThumbprint
            : source.ExpectedCertificateThumbprint;
        target.SignaturePublicKeyPem = string.IsNullOrWhiteSpace(source.SignaturePublicKeyPem)
            ? target.SignaturePublicKeyPem
            : source.SignaturePublicKeyPem;
    }
}
