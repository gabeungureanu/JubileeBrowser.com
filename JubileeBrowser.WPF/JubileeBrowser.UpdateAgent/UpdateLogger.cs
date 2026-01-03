namespace JubileeBrowser.UpdateAgent;

public class UpdateLogger
{
    private readonly string _logPath;
    private readonly object _lock = new();

    public UpdateLogger(UpdateAgentOptions options)
    {
        var logRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "JubileeBrowser",
            "updates"
        );
        Directory.CreateDirectory(logRoot);
        _logPath = Path.Combine(logRoot, "update-agent.log");
    }

    public void Info(string message)
    {
        Write("INFO", message);
    }

    public void Warn(string message)
    {
        Write("WARN", message);
    }

    public void Error(string message)
    {
        Write("ERROR", message);
    }

    private void Write(string level, string message)
    {
        try
        {
            var line = $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}] {level} {message}{Environment.NewLine}";
            lock (_lock)
            {
                File.AppendAllText(_logPath, line);
            }
        }
        catch
        {
            // Ignore logging errors.
        }
    }
}
