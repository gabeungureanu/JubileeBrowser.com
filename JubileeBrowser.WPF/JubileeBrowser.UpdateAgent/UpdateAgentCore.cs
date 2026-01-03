using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace JubileeBrowser.UpdateAgent;

public class UpdateAgentCore
{
    private readonly UpdateAgentOptions _options;
    private readonly UpdateLogger _logger;
    private readonly HttpClient _httpClient;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly string _updateRoot;
    private readonly string _stagingRoot;
    private readonly string _backupRoot;
    private readonly string _pendingPath;
    private readonly string _installedVersionPath;

    public UpdateAgentCore(UpdateAgentOptions options, UpdateLogger logger)
    {
        _options = options;
        _logger = logger;

        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        _updateRoot = Path.Combine(programData, "JubileeBrowser", "updates");
        _stagingRoot = Path.Combine(_updateRoot, "staging");
        _backupRoot = Path.Combine(_updateRoot, "backup");
        _pendingPath = Path.Combine(_updateRoot, "pending.json");
        _installedVersionPath = Path.Combine(_updateRoot, "installed-version.txt");

        Directory.CreateDirectory(_updateRoot);
        Directory.CreateDirectory(_stagingRoot);
        Directory.CreateDirectory(_backupRoot);

        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(10)
        };
        _httpClient.DefaultRequestHeaders.UserAgent.Clear();
        _httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("JubileeBrowserUpdateAgent", "1.0"));
    }

    public async Task RunOnceAsync(bool applyOnly, CancellationToken cancellationToken)
    {
        if (!applyOnly)
        {
            await CheckAndStageUpdateAsync(cancellationToken);
        }

        await TryApplyPendingUpdateAsync(cancellationToken);
    }

    public async Task CheckAndStageUpdateAsync(CancellationToken cancellationToken)
    {
        if (!IsHttpsEndpoint(_options.UpdateEndpoint))
        {
            _logger.Error($"Update endpoint must be HTTPS: {_options.UpdateEndpoint}");
            return;
        }

        var release = await FetchLatestReleaseAsync(cancellationToken);
        if (release == null)
        {
            return;
        }

        var installedVersion = GetInstalledVersion();
        var latestVersion = ParseVersion(release.Version);

        if (latestVersion <= installedVersion)
        {
            _logger.Info($"No update available. Installed={installedVersion}, Latest={latestVersion}");
            return;
        }

        var pending = LoadPendingUpdate();
        if (pending != null && string.Equals(pending.Version, release.Version, StringComparison.OrdinalIgnoreCase))
        {
            _logger.Info($"Update {release.Version} already staged.");
            return;
        }

        if (string.IsNullOrWhiteSpace(release.DownloadUrl))
        {
            _logger.Error("Manifest missing downloadUrl. Aborting update check.");
            return;
        }

        await DownloadAndStageAsync(release, cancellationToken);
    }

    public async Task TryApplyPendingUpdateAsync(CancellationToken cancellationToken)
    {
        var pending = LoadPendingUpdate();
        if (pending == null)
        {
            return;
        }

        if (IsBrowserRunning())
        {
            _logger.Info("Browser is running; deferring update apply.");
            return;
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
        }
        catch (TaskCanceledException)
        {
            return;
        }

        var applied = await ApplyUpdateAsync(pending, cancellationToken);
        if (applied)
        {
            ClearPendingUpdate();
            CleanupStaging(pending);
        }
        else
        {
            MarkPendingFailed(pending);
        }
    }

    private async Task<ReleaseManifest?> FetchLatestReleaseAsync(CancellationToken cancellationToken)
    {
        try
        {
            var channel = NormalizeChannel(_options.Channel);
            var endpoint = _options.UpdateEndpoint.TrimEnd('/');
            var manifestUrl = $"{endpoint}/{channel}/releases.json";

            using var response = await _httpClient.GetAsync(manifestUrl, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.Error($"Update manifest request failed: {response.StatusCode}");
                return null;
            }

            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            ReleaseManifest? latest = null;
            try
            {
                var releases = JsonSerializer.Deserialize<ReleaseManifest[]>(content, _jsonOptions);
                if (releases != null && releases.Length > 0)
                {
                    latest = releases[0];
                }
            }
            catch
            {
                // Ignore and try single-manifest parse.
            }

            if (latest == null)
            {
                latest = JsonSerializer.Deserialize<ReleaseManifest>(content, _jsonOptions);
            }

            if (latest == null)
            {
                _logger.Warn("Update manifest was empty.");
                return null;
            }

            return latest;
        }
        catch (Exception ex)
        {
            _logger.Error($"Update manifest fetch failed: {ex.Message}");
            return null;
        }
    }

    private async Task DownloadAndStageAsync(ReleaseManifest release, CancellationToken cancellationToken)
    {
        var channel = NormalizeChannel(_options.Channel);
        var downloadUri = ResolveDownloadUri(release.DownloadUrl, channel);

        if (!IsHttpsEndpoint(downloadUri.ToString()))
        {
            _logger.Error($"Download URL must be HTTPS: {downloadUri}");
            return;
        }

        var stagingDir = Path.Combine(_stagingRoot, release.Version);
        Directory.CreateDirectory(stagingDir);

        var fileName = Path.GetFileName(downloadUri.LocalPath);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = $"JubileeBrowser-{release.Version}.zip";
        }

        var packagePath = Path.Combine(stagingDir, fileName);
        var tempPath = packagePath + ".partial";

        _logger.Info($"Downloading update {release.Version} from {downloadUri}");

        try
        {
            using var response = await _httpClient.GetAsync(downloadUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();

            await using (var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var fileStream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await contentStream.CopyToAsync(fileStream, cancellationToken);
            }

            if (File.Exists(packagePath))
            {
                File.Delete(packagePath);
            }

            File.Move(tempPath, packagePath);

            if (!VerifyPackage(packagePath, release))
            {
                _logger.Error("Update verification failed. Aborting staging.");
                File.Delete(packagePath);
                return;
            }

            if (!packagePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                _logger.Error("Update package must be a .zip archive for side-by-side updates.");
                return;
            }

            var payloadDir = Path.Combine(stagingDir, "payload");
            if (Directory.Exists(payloadDir))
            {
                Directory.Delete(payloadDir, true);
            }

            ZipFile.ExtractToDirectory(packagePath, payloadDir);

            var pending = new PendingUpdate
            {
                Version = release.Version,
                DownloadedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                PackagePath = packagePath,
                StagedPath = payloadDir,
                ReleaseNotes = release.ReleaseNotes
            };

            SavePendingUpdate(pending);
            _logger.Info($"Update {release.Version} staged at {payloadDir}");
        }
        catch (Exception ex)
        {
            _logger.Error($"Download failed: {ex.Message}");
            CleanupTempFile(tempPath);
        }
    }

    private bool VerifyPackage(string packagePath, ReleaseManifest release)
    {
        if (string.IsNullOrWhiteSpace(release.Sha256))
        {
            _logger.Error("Manifest missing sha256 hash.");
            return false;
        }

        byte[] hashBytes;
        try
        {
            using var stream = File.OpenRead(packagePath);
            using var sha256 = SHA256.Create();
            hashBytes = sha256.ComputeHash(stream);
        }
        catch (Exception ex)
        {
            _logger.Error($"Failed to compute SHA256: {ex.Message}");
            return false;
        }

        var hashHex = Convert.ToHexString(hashBytes);
        if (!string.Equals(hashHex, release.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            _logger.Error($"SHA256 mismatch. Expected {release.Sha256}, got {hashHex}.");
            return false;
        }

        if (!string.IsNullOrWhiteSpace(_options.SignaturePublicKeyPem) && !string.IsNullOrWhiteSpace(release.Signature))
        {
            if (!SignatureVerifier.VerifySignature(hashBytes, release.Signature, _options.SignaturePublicKeyPem))
            {
                _logger.Error("Signature verification failed.");
                return false;
            }
        }

        if (!string.IsNullOrWhiteSpace(_options.ExpectedCertificateThumbprint))
        {
            var extension = Path.GetExtension(packagePath);
            if (extension.Equals(".exe", StringComparison.OrdinalIgnoreCase) ||
                extension.Equals(".msi", StringComparison.OrdinalIgnoreCase) ||
                extension.Equals(".msix", StringComparison.OrdinalIgnoreCase))
            {
                if (!AuthenticodeVerifier.Verify(packagePath, _options.ExpectedCertificateThumbprint))
                {
                    _logger.Error("Authenticode signature validation failed.");
                    return false;
                }
            }
        }

        return true;
    }

    private async Task<bool> ApplyUpdateAsync(PendingUpdate pending, CancellationToken cancellationToken)
    {
        if (!Directory.Exists(pending.StagedPath))
        {
            _logger.Error($"Staged payload not found: {pending.StagedPath}");
            return false;
        }

        var appRoot = ResolveAppRoot();
        var executablePath = Path.Combine(appRoot, _options.MainExecutableName);
        if (!File.Exists(executablePath))
        {
            _logger.Error($"Main executable not found: {executablePath}");
            return false;
        }

        var backupDir = Path.Combine(_backupRoot, $"{pending.Version}-{DateTime.UtcNow:yyyyMMddHHmmss}");
        Directory.CreateDirectory(backupDir);

        try
        {
            var files = Directory.GetFiles(pending.StagedPath, "*", SearchOption.AllDirectories);

            foreach (var sourcePath in files)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var relativePath = Path.GetRelativePath(pending.StagedPath, sourcePath);
                if (ShouldSkip(relativePath))
                {
                    continue;
                }

                var destinationPath = Path.Combine(appRoot, relativePath);
                var destinationDir = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationDir))
                {
                    Directory.CreateDirectory(destinationDir);
                }

                if (File.Exists(destinationPath))
                {
                    var backupPath = Path.Combine(backupDir, relativePath);
                    var backupDirPath = Path.GetDirectoryName(backupPath);
                    if (!string.IsNullOrEmpty(backupDirPath))
                    {
                        Directory.CreateDirectory(backupDirPath);
                    }

                    File.Copy(destinationPath, backupPath, true);
                }

                File.Copy(sourcePath, destinationPath, true);
            }

            File.WriteAllText(_installedVersionPath, pending.Version);
            _logger.Info($"Update applied successfully: {pending.Version}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.Error($"Apply update failed: {ex.Message}");
            RestoreBackup(backupDir, appRoot);
            return false;
        }
    }

    private void RestoreBackup(string backupDir, string appRoot)
    {
        try
        {
            if (!Directory.Exists(backupDir))
            {
                return;
            }

            var files = Directory.GetFiles(backupDir, "*", SearchOption.AllDirectories);
            foreach (var backupPath in files)
            {
                var relativePath = Path.GetRelativePath(backupDir, backupPath);
                var destinationPath = Path.Combine(appRoot, relativePath);
                var destinationDir = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationDir))
                {
                    Directory.CreateDirectory(destinationDir);
                }

                File.Copy(backupPath, destinationPath, true);
            }

            _logger.Warn("Rollback completed from backup.");
        }
        catch (Exception ex)
        {
            _logger.Error($"Rollback failed: {ex.Message}");
        }
    }

    private PendingUpdate? LoadPendingUpdate()
    {
        try
        {
            if (!File.Exists(_pendingPath))
            {
                return null;
            }

            var json = File.ReadAllText(_pendingPath);
            return JsonSerializer.Deserialize<PendingUpdate>(json, _jsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private void SavePendingUpdate(PendingUpdate pending)
    {
        var json = JsonSerializer.Serialize(pending, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_pendingPath, json);
    }

    private void ClearPendingUpdate()
    {
        try
        {
            if (File.Exists(_pendingPath))
            {
                File.Delete(_pendingPath);
            }
        }
        catch
        {
            // Ignore cleanup errors.
        }
    }

    private void MarkPendingFailed(PendingUpdate pending)
    {
        try
        {
            var failedPath = Path.Combine(_updateRoot, $"pending.failed.{DateTime.UtcNow:yyyyMMddHHmmss}.json");
            var json = JsonSerializer.Serialize(pending, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(failedPath, json);
        }
        catch
        {
            // Ignore failure capture errors.
        }
    }

    private void CleanupStaging(PendingUpdate pending)
    {
        try
        {
            var stagingDir = Directory.GetParent(pending.StagedPath)?.FullName;
            if (!string.IsNullOrWhiteSpace(stagingDir) && Directory.Exists(stagingDir))
            {
                Directory.Delete(stagingDir, true);
            }
        }
        catch
        {
            // Ignore cleanup errors.
        }
    }

    private void CleanupTempFile(string tempPath)
    {
        try
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
        catch
        {
            // Ignore cleanup errors.
        }
    }

    private string ResolveAppRoot()
    {
        var installRoot = ResolveInstallRoot();

        var appRoot = Path.Combine(installRoot, "app");
        if (File.Exists(Path.Combine(appRoot, _options.MainExecutableName)))
        {
            return appRoot;
        }

        var currentRoot = Path.Combine(installRoot, "current");
        if (File.Exists(Path.Combine(currentRoot, _options.MainExecutableName)))
        {
            return currentRoot;
        }

        return installRoot;
    }

    private string ResolveInstallRoot()
    {
        if (!string.IsNullOrWhiteSpace(_options.InstallRoot))
        {
            return _options.InstallRoot;
        }

        return AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private Version GetInstalledVersion()
    {
        try
        {
            var appRoot = ResolveAppRoot();
            var exePath = Path.Combine(appRoot, _options.MainExecutableName);
            if (!File.Exists(exePath))
            {
                return new Version(0, 0, 0, 0);
            }

            var versionInfo = FileVersionInfo.GetVersionInfo(exePath);
            var versionText = versionInfo.ProductVersion ?? versionInfo.FileVersion ?? "0.0.0.0";
            return ParseVersion(versionText);
        }
        catch
        {
            return new Version(0, 0, 0, 0);
        }
    }

    private bool IsBrowserRunning()
    {
        try
        {
            var processName = Path.GetFileNameWithoutExtension(_options.MainExecutableName);
            return Process.GetProcessesByName(processName).Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizeChannel(string? channel)
    {
        if (string.IsNullOrWhiteSpace(channel))
        {
            return "stable";
        }

        var lowered = channel.Trim().ToLowerInvariant();
        return lowered == "beta" ? "beta" : "stable";
    }

    private static bool IsHttpsEndpoint(string? endpoint)
    {
        return endpoint != null && endpoint.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
    }

    private Uri ResolveDownloadUri(string downloadUrl, string channel)
    {
        var endpoint = _options.UpdateEndpoint.TrimEnd('/');

        if (Uri.TryCreate(downloadUrl, UriKind.Absolute, out var absolute))
        {
            return absolute;
        }

        if (downloadUrl.StartsWith("/"))
        {
            return new Uri($"{endpoint}{downloadUrl}");
        }

        return new Uri($"{endpoint}/{channel}/{downloadUrl}");
    }

    private static Version ParseVersion(string? versionText)
    {
        if (string.IsNullOrWhiteSpace(versionText))
        {
            return new Version(0, 0, 0, 0);
        }

        var cleaned = versionText.Trim();
        var plusIndex = cleaned.IndexOf('+');
        if (plusIndex >= 0)
        {
            cleaned = cleaned[..plusIndex];
        }

        var dashIndex = cleaned.IndexOf('-');
        if (dashIndex >= 0)
        {
            cleaned = cleaned[..dashIndex];
        }

        if (Version.TryParse(cleaned, out var parsed))
        {
            return parsed;
        }

        return new Version(0, 0, 0, 0);
    }

    private bool ShouldSkip(string relativePath)
    {
        var fileName = Path.GetFileName(relativePath);
        if (fileName.StartsWith("JubileeBrowser.UpdateAgent", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(fileName, "update-agent.json", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }
}
