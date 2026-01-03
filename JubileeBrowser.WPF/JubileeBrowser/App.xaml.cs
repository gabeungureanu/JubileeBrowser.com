using System.Windows;
using System.Windows.Threading;

namespace JubileeBrowser;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Handle unhandled exceptions
        DispatcherUnhandledException += App_DispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;
        TaskScheduler.UnobservedTaskException += TaskScheduler_UnobservedTaskException;

        // Set up app data directory
        EnsureAppDataDirectory();
    }

    private void EnsureAppDataDirectory()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );

        if (!Directory.Exists(appDataPath))
        {
            Directory.CreateDirectory(appDataPath);
        }
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        LogException("DispatcherUnhandledException", e.Exception);
        e.Handled = true;

        MessageBox.Show(
            $"An error occurred: {e.Exception.Message}\n\nThe application will continue running.",
            "Jubilee Browser Error",
            MessageBoxButton.OK,
            MessageBoxImage.Warning
        );
    }

    private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            LogException("UnhandledException", ex);
        }
    }

    private void TaskScheduler_UnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        LogException("UnobservedTaskException", e.Exception);
        e.SetObserved();
    }

    private static void LogException(string source, Exception ex)
    {
        try
        {
            var logPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "JubileeBrowser",
                "error.log"
            );

            var logEntry = $"[{DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}] {source}: {ex}\n\n";
            File.AppendAllText(logPath, logEntry);

            System.Diagnostics.Debug.WriteLine($"{source}: {ex}");
        }
        catch
        {
            // Ignore logging errors
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        base.OnExit(e);
    }
}
