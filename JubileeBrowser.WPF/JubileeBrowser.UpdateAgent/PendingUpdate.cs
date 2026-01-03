namespace JubileeBrowser.UpdateAgent;

public class PendingUpdate
{
    public string Version { get; set; } = string.Empty;
    public long DownloadedAt { get; set; }
    public string PackagePath { get; set; } = string.Empty;
    public string StagedPath { get; set; } = string.Empty;
    public string? ReleaseNotes { get; set; }
}
