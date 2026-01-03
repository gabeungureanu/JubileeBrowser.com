namespace JubileeBrowser.Models;

public enum UpdateStatus
{
    Idle,
    Checking,
    Available,
    NotAvailable,
    Downloading,
    Downloaded,
    Error
}

public enum UpdateChannel
{
    Stable,
    Beta
}

public class UpdateState
{
    public UpdateStatus Status { get; set; } = UpdateStatus.Idle;
    public UpdateChannel Channel { get; set; } = UpdateChannel.Stable;
    public string CurrentVersion { get; set; } = string.Empty;
    public string? AvailableVersion { get; set; }
    public double? DownloadProgress { get; set; }
    public long? LastCheckTime { get; set; }
    public string? LastError { get; set; }
    public string? ReleaseNotes { get; set; }
}

public class UpdateProgress
{
    public double Percent { get; set; }
    public double BytesPerSecond { get; set; }
    public long Transferred { get; set; }
    public long Total { get; set; }
}
