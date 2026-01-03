# Jubilee Browser Update Agent

This update agent runs separately from the browser and performs background update checks, secure downloads, and staged installs. It can run as a Windows Service or as a scheduled task.

## How it works

1. Checks the update manifest over HTTPS at a fixed interval (default: 4 hours).
2. Compares the installed version to the latest manifest version.
3. Downloads the update package into a staging directory.
4. Verifies SHA-256 (required) and optional signatures (RSA or Authenticode).
5. Waits until the browser is not running, then applies the update.
6. Rolls back from backup if the apply step fails.

## Staging and logs

- Staging root: `%ProgramData%\JubileeBrowser\updates\staging`
- Backups: `%ProgramData%\JubileeBrowser\updates\backup`
- Pending marker: `%ProgramData%\JubileeBrowser\updates\pending.json`
- Logs: `%ProgramData%\JubileeBrowser\updates\update-agent.log`

## Manifest format (JSON)

The update endpoint should expose `/stable/releases.json` and `/beta/releases.json` with the newest release first.

```json
[
  {
    "version": "8.0.5",
    "releaseNotes": "Bug fixes and improvements.",
    "downloadUrl": "https://updates.jubileebrowser.com/releases/stable/JubileeBrowser-8.0.5.zip",
    "sha256": "HEX_SHA256_HASH",
    "signature": "BASE64_RSA_SIGNATURE"
  }
]
```

- `downloadUrl` must point to a `.zip` archive that contains the full application files.
- `sha256` is required.
- `signature` is optional but recommended when a public key is configured.

## Configuration

Optional configuration file: `update-agent.json` (next to the agent exe or in `%ProgramData%\JubileeBrowser`).

```json
{
  "updateEndpoint": "https://updates.jubileebrowser.com/releases",
  "channel": "stable",
  "checkIntervalHours": 4,
  "initialDelaySeconds": 30,
  "applyCheckIntervalMinutes": 5,
  "expectedCertificateThumbprint": "",
  "signaturePublicKeyPem": ""
}
```

## Installing the background agent

Scheduled task (runs every 4 hours by default):

```
powershell -ExecutionPolicy Bypass -File scripts\install-update-agent.ps1 -IntervalHours 4
```

Windows Service:

```
powershell -ExecutionPolicy Bypass -File scripts\install-update-service.ps1
```
