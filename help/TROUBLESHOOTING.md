# Jubilee Browser Troubleshooting Guide

This document provides solutions to common issues encountered during installation, updates, and operation of Jubilee Browser.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Support Portal**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Update Issues](#update-issues)
3. [Runtime Issues](#runtime-issues)
4. [Performance Issues](#performance-issues)
5. [Network Issues](#network-issues)
6. [Diagnostic Tools](#diagnostic-tools)
7. [Log File Locations](#log-file-locations)
8. [Support Escalation](#support-escalation)

---

## Installation Issues

### Installer won't start

**Symptoms**:
- Double-clicking installer does nothing
- Installer crashes immediately

**Possible Causes & Solutions**:

1. **Antivirus blocking**
   - Temporarily disable antivirus
   - Add installer to exclusion list
   - Run as administrator

2. **Corrupted download**
   ```batch
   # Verify file size matches expected
   dir JubileeSetup-1.0.0.exe

   # Re-download installer
   ```

3. **Missing Visual C++ Runtime**
   - Download from Microsoft: [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)

### "Windows protected your PC" / SmartScreen warning

**Symptoms**:
- Windows Defender SmartScreen blocks installation
- "Unknown publisher" warning

**Solutions**:

1. **Click "More info" → "Run anyway"**

2. **For IT admins - disable for this publisher**:
   ```powershell
   # Group Policy: Computer Configuration > Administrative Templates >
   # Windows Components > Windows Defender SmartScreen > Explorer
   ```

3. **Long-term solution**: Application needs code signing certificate with reputation

### Silent install fails

**Symptoms**:
- `JubileeSetup.exe /S` exits with non-zero code
- No installation occurs

**Diagnostic Steps**:

1. **Enable logging**:
   ```batch
   JubileeSetup.exe /S /LOG=C:\temp\install.log
   ```

2. **Check exit code**:
   ```batch
   JubileeSetup.exe /S
   echo Exit code: %ERRORLEVEL%
   ```

3. **Common exit codes**:
   | Code | Meaning | Solution |
   |------|---------|----------|
   | 0 | Success | N/A |
   | 1 | Cancelled | Check for interactive prompts |
   | 2 | Failed | Check log for details |
   | 5 | Access denied | Run as administrator |

4. **Run elevated for per-machine**:
   ```batch
   runas /user:Administrator "JubileeSetup.exe /S /ALLUSERS"
   ```

### Installation directory access denied

**Symptoms**:
- Error during file extraction
- "Cannot write to [path]"

**Solutions**:

1. **Use per-user installation** (default)
   - Installs to `%LOCALAPPDATA%\Programs\JubileeBrowser`
   - No admin rights needed

2. **For per-machine installation**:
   ```batch
   # Run as administrator
   JubileeSetup.exe /S /ALLUSERS
   ```

3. **Check folder permissions**:
   ```batch
   icacls "C:\Program Files\JubileeBrowser"
   ```

### Installer hangs

**Symptoms**:
- Progress bar stops moving
- Installer becomes unresponsive

**Solutions**:

1. **Kill and retry**:
   ```batch
   taskkill /F /IM JubileeSetup.exe
   # Delete partial installation
   rmdir /S /Q "%LOCALAPPDATA%\Programs\JubileeBrowser"
   # Retry installation
   JubileeSetup.exe
   ```

2. **Check for locked files**:
   - Close any running Jubilee Browser instances
   - Close file explorer windows in the install directory

3. **Disable real-time antivirus scanning temporarily**

---

## Update Issues

### Updates not detected

**Symptoms**:
- "Jubilee Browser is up to date" even though newer version exists
- Update check never completes

**Diagnostic Steps**:

1. **Check update log**:
   ```
   %LOCALAPPDATA%\JubileeBrowser\update.log
   ```

2. **Look for**:
   ```
   Skip checkForUpdates because application is not packed
   ```
   This is normal in development mode. Updates only work in packaged builds.

3. **Verify network connectivity**:
   ```batch
   curl -I https://updates.jubileebrowser.com/releases/stable/latest.yml
   ```

4. **Check firewall**:
   - Allow outbound HTTPS (port 443) to `updates.jubileebrowser.com`

### Download fails repeatedly

**Symptoms**:
- "Unable to connect to update server"
- Download progress resets

**Solutions**:

1. **Check connectivity**:
   ```batch
   ping updates.jubileebrowser.com
   tracert updates.jubileebrowser.com
   ```

2. **Check proxy settings**:
   ```batch
   netsh winhttp show proxy
   ```

3. **Clear update cache**:
   ```batch
   rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser\update-cache"
   ```

4. **Manual download**:
   - Download installer from https://jubileebrowser.com/download
   - Run installer to upgrade

### "Update verification failed"

**Symptoms**:
- Update downloads but fails to verify
- Error mentions signature or checksum

**Possible Causes**:

1. **Corrupted download**
   - Network issues during download
   - Proxy modifying content

2. **Tampered update file**
   - Security threat - investigate!

**Solutions**:

1. **Clear cache and retry**:
   ```batch
   rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser\update-cache"
   ```

2. **Download manually and verify**:
   - Download from official source
   - Verify code signature

### Update stuck at "downloaded"

**Symptoms**:
- Update shows as ready but won't install
- Clicking "Restart to Update" does nothing

**Solutions**:

1. **Check for locked files**:
   ```batch
   handle.exe JubileeBrowser
   ```

2. **Manually restart**:
   - Close Jubilee Browser completely
   - Wait 5 seconds
   - Start Jubilee Browser

3. **Force update**:
   ```batch
   # Close browser
   taskkill /F /IM Jubilee.exe

   # Run pending update
   "%LOCALAPPDATA%\JubileeBrowser\Update.exe" --processStart Jubilee.exe
   ```

### Session not restored after update

**Symptoms**:
- Tabs lost after restart
- Window position not preserved

**Diagnostic Steps**:

1. **Check session state file**:
   ```
   %LOCALAPPDATA%\JubileeBrowser\session-state.json
   ```

2. **Verify file is valid JSON**:
   ```batch
   type "%LOCALAPPDATA%\JubileeBrowser\session-state.json"
   ```

3. **Check for crash during save**:
   - Look for `.tmp` files in the directory
   - These indicate incomplete writes

**Recovery**:
If `session-state.json` is corrupt:
```batch
# Backup corrupt file
copy session-state.json session-state.corrupt.json

# Delete to reset
del session-state.json
```

---

## Runtime Issues

### Application won't start

**Symptoms**:
- Nothing happens when clicking Jubilee Browser
- Brief window flash then closes

**Diagnostic Steps**:

1. **Run from command line**:
   ```batch
   "%LOCALAPPDATA%\Programs\JubileeBrowser\Jubilee.exe"
   ```
   Watch for error messages.

2. **Check Event Viewer**:
   - Windows Logs > Application
   - Look for "Jubilee" or "Electron" errors

3. **Check for corrupt user data**:
   ```batch
   # Rename user data folder to reset
   move "%LOCALAPPDATA%\JubileeBrowser" "%LOCALAPPDATA%\JubileeBrowser.bak"

   # Try starting app
   "%LOCALAPPDATA%\Programs\JubileeBrowser\Jubilee.exe"
   ```

### Crash on startup

**Symptoms**:
- Error dialog appears
- Application crashes immediately

**Common Causes**:

1. **GPU issues**:
   ```batch
   # Start with GPU disabled
   Jubilee.exe --disable-gpu
   ```

2. **Corrupt settings**:
   ```batch
   del "%LOCALAPPDATA%\JubileeBrowser\settings.json"
   ```

3. **Extension conflicts** (if applicable):
   - Start in safe mode (no extensions)

### White/blank screen

**Symptoms**:
- Window opens but content is white
- UI elements don't appear

**Solutions**:

1. **Hard refresh**:
   - Press `Ctrl+Shift+R`

2. **Clear renderer cache**:
   ```batch
   rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser\Cache"
   rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser\GPUCache"
   ```

3. **Disable hardware acceleration**:
   - Settings > Advanced > Disable hardware acceleration
   - Or: `Jubilee.exe --disable-gpu`

### inspire:// URLs not working

**Symptoms**:
- inspire:// links don't open
- "Protocol not recognized" error

**Solutions**:

1. **Verify protocol registration**:
   ```batch
   reg query "HKCU\Software\Classes\inspire\shell\open\command"
   ```

2. **Re-register protocol**:
   - Repair installation
   - Or manually register:
   ```batch
   reg add "HKCU\Software\Classes\inspire" /ve /d "URL:Inspire Protocol" /f
   reg add "HKCU\Software\Classes\inspire" /v "URL Protocol" /d "" /f
   reg add "HKCU\Software\Classes\inspire\shell\open\command" /ve /d "\"%LOCALAPPDATA%\Programs\JubileeBrowser\Jubilee.exe\" \"%%1\"" /f
   ```

---

## Performance Issues

### Slow startup

**Symptoms**:
- Takes >10 seconds to show window
- Splash screen hangs

**Solutions**:

1. **Check startup items**:
   - Disable unnecessary startup programs
   - Check Task Manager > Startup

2. **Clear cache**:
   ```batch
   rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser\Cache"
   ```

3. **Check disk health**:
   ```batch
   chkdsk C: /F
   ```

### High memory usage

**Symptoms**:
- RAM usage exceeds 1GB with few tabs
- System slowdown

**Solutions**:

1. **Close unused tabs**
   - Each tab uses memory

2. **Clear browsing data**:
   - Settings > Privacy > Clear browsing data

3. **Check for memory leaks**:
   - Open Task Manager
   - Monitor memory over time
   - Report if continuously increasing

### High CPU usage

**Symptoms**:
- CPU constantly at high percentage
- Fans running loudly

**Diagnostic Steps**:

1. **Identify the process**:
   ```batch
   tasklist /FI "IMAGENAME eq Jubilee.exe" /V
   ```

2. **Check for runaway tabs**:
   - Some websites use excessive CPU
   - Close tabs one by one to identify

3. **Disable hardware acceleration**:
   - Sometimes GPU issues cause CPU fallback

---

## Network Issues

### Cannot load any pages

**Symptoms**:
- All pages show "ERR_CONNECTION_REFUSED"
- No network access

**Diagnostic Steps**:

1. **Check basic connectivity**:
   ```batch
   ping google.com
   ```

2. **Check DNS**:
   ```batch
   nslookup google.com
   ```

3. **Check proxy**:
   ```batch
   netsh winhttp show proxy
   ```

4. **Try other browsers**:
   - If other browsers work, issue is app-specific

### Proxy not working

**Symptoms**:
- Pages don't load behind corporate proxy
- Authentication prompts loop

**Solutions**:

1. **Configure system proxy**:
   - Jubilee Browser uses system proxy settings
   - Configure in Windows Settings > Network & Internet > Proxy

2. **For PAC files**:
   - Ensure PAC URL is accessible
   - Check PAC file syntax

### SSL/Certificate errors

**Symptoms**:
- "Your connection is not private"
- Certificate warnings

**Possible Causes**:

1. **System clock wrong**:
   ```batch
   w32tm /query /status
   ```

2. **Corporate MITM proxy**:
   - Install corporate root CA
   - Certificate Manager > Trusted Root CAs

3. **Actual security issue**:
   - Do not bypass for unknown sites

---

## Diagnostic Tools

### Built-in Diagnostics

1. **Update log**:
   ```
   %LOCALAPPDATA%\JubileeBrowser\update.log
   ```

2. **Installation log**:
   ```
   %LOCALAPPDATA%\Programs\JubileeBrowser\install.log
   ```

3. **DevTools**:
   - Press `F12` or `Ctrl+Shift+I`
   - Check Console tab for errors

### Command-line Flags

```batch
# Verbose logging
Jubilee.exe --enable-logging --v=1

# Disable GPU
Jubilee.exe --disable-gpu

# Disable sandbox (debugging only)
Jubilee.exe --no-sandbox

# Custom user data directory
Jubilee.exe --user-data-dir="C:\temp\jubilee-test"

# Remote debugging
Jubilee.exe --remote-debugging-port=9222
```

### Windows Tools

```batch
# Event Viewer
eventvwr.msc

# Registry Editor
regedit

# Process Explorer (Sysinternals)
procexp.exe

# Handle viewer (Sysinternals)
handle.exe Jubilee
```

---

## Log File Locations

| Log | Location | Purpose |
|-----|----------|---------|
| Installation log | `{INSTDIR}\install.log` | NSIS installer actions |
| Update log | `%LOCALAPPDATA%\JubileeBrowser\update.log` | Update checks and downloads |
| Application logs | `%LOCALAPPDATA%\JubileeBrowser\logs\` | General application logs |
| Crash reports | `%LOCALAPPDATA%\JubileeBrowser\Crashpad\` | Crash dump files |

### Collecting Logs for Support

```batch
@echo off
set LOGDIR=%TEMP%\jubilee-logs-%DATE:~-4%%DATE:~4,2%%DATE:~7,2%

mkdir "%LOGDIR%"

copy "%LOCALAPPDATA%\JubileeBrowser\update.log" "%LOGDIR%\"
copy "%LOCALAPPDATA%\JubileeBrowser\settings.json" "%LOGDIR%\"
copy "%LOCALAPPDATA%\JubileeBrowser\install-info.json" "%LOGDIR%\"
copy "%LOCALAPPDATA%\Programs\JubileeBrowser\install.log" "%LOGDIR%\"

systeminfo > "%LOGDIR%\systeminfo.txt"

echo Logs collected to: %LOGDIR%
```

---

## Support Escalation

### Before Contacting Support

1. **Check this troubleshooting guide**
2. **Search existing issues**: https://github.com/jubileebrowser/jubilee/issues
3. **Collect logs** (see above)
4. **Document steps to reproduce**

### Information to Provide

1. **Version information**:
   - Jubilee Browser version (About dialog)
   - Windows version (`winver`)

2. **Steps to reproduce**:
   - Exact sequence of actions
   - Expected vs actual behavior

3. **Log files**:
   - Update log
   - Installation log
   - Crash dumps (if applicable)

4. **Environment**:
   - Antivirus software
   - Proxy/firewall configuration
   - Other relevant software

### Contact Methods

- **Support Portal**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
- **Documentation**: [https://jubileebrowser.com/docs](https://jubileebrowser.com/docs)
- **FAQs**: [https://jubileebrowser.com/faq](https://jubileebrowser.com/faq)
- **Email**: support@jubileebrowser.com
- **GitHub Issues**: [https://github.com/jubileebrowser/jubilee/issues](https://github.com/jubileebrowser/jubilee/issues)

---

## Related Documentation

- [INSTALLATION.md](INSTALLATION.md) - Installation process
- [AUTO_UPDATE.md](AUTO_UPDATE.md) - Update system
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [DEPLOYMENT.md](DEPLOYMENT.md) - Enterprise deployment
