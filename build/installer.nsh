; Jubilee Browser Custom NSIS Installer Script
; This file is included in the electron-builder NSIS installer

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Custom macros for Jubilee Browser installation

; ============================================================================
; INSTALLER VARIABLES
; ============================================================================

Var INSTALL_LOG_FILE
Var FIRST_RUN_FLAG

; ============================================================================
; CUSTOM INITIALIZATION
; ============================================================================

!macro customInit
  ; Set up logging
  StrCpy $INSTALL_LOG_FILE "$TEMP\jubilee-install.log"

  ; Log installation start
  FileOpen $0 $INSTALL_LOG_FILE a
  ${GetTime} "" "L" $1 $2 $3 $4 $5 $6 $7
  FileWrite $0 "[$3-$2-$1 $4:$5:$6] Jubilee Browser installation started$\r$\n"
  FileWrite $0 "[$3-$2-$1 $4:$5:$6] Installer version: ${VERSION}$\r$\n"
  FileWrite $0 "[$3-$2-$1 $4:$5:$6] Target directory: $INSTDIR$\r$\n"
  FileClose $0

  ; Check for existing installation and handle upgrade
  ReadRegStr $0 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  ${If} $0 != ""
    ; Existing installation found - this is an upgrade
    FileOpen $1 $INSTALL_LOG_FILE a
    FileWrite $1 "Existing installation found at: $0$\r$\n"
    FileClose $1
  ${EndIf}
!macroend

; ============================================================================
; CUSTOM INSTALL ACTIONS
; ============================================================================

!macro customInstall
  ; Create first-run flag file
  FileOpen $0 "$INSTDIR\.first-run" w
  FileWrite $0 "1"
  FileClose $0

  ; Write installation info to registry for app identification
  WriteRegStr SHCTX "Software\JubileeBrowser" "InstallPath" "$INSTDIR"
  WriteRegStr SHCTX "Software\JubileeBrowser" "Version" "${VERSION}"
  WriteRegStr SHCTX "Software\JubileeBrowser" "InstallDate" "$3-$2-$1"
  WriteRegDWORD SHCTX "Software\JubileeBrowser" "PerMachine" 0

  ; Register application capabilities for Windows
  WriteRegStr SHCTX "Software\RegisteredApplications" "JubileeBrowser" "Software\JubileeBrowser\Capabilities"
  WriteRegStr SHCTX "Software\JubileeBrowser\Capabilities" "ApplicationName" "Jubilee Browser"
  WriteRegStr SHCTX "Software\JubileeBrowser\Capabilities" "ApplicationDescription" "A dual-mode browser for Internet and Jubilee Bibles"
  WriteRegStr SHCTX "Software\JubileeBrowser\Capabilities" "ApplicationIcon" "$INSTDIR\Jubilee.exe,0"

  ; Register URL associations (optional - for future use)
  WriteRegStr SHCTX "Software\JubileeBrowser\Capabilities\URLAssociations" "http" "JubileeBrowserHTML"
  WriteRegStr SHCTX "Software\JubileeBrowser\Capabilities\URLAssociations" "https" "JubileeBrowserHTML"
  WriteRegStr SHCTX "Software\JubileeBrowser\Capabilities\URLAssociations" "inspire" "JubileeBrowserInspire"

  ; Register inspire:// protocol handler
  WriteRegStr SHCTX "Software\Classes\inspire" "" "URL:Inspire Protocol"
  WriteRegStr SHCTX "Software\Classes\inspire" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\inspire\DefaultIcon" "" "$INSTDIR\Jubilee.exe,0"
  WriteRegStr SHCTX "Software\Classes\inspire\shell\open\command" "" '"$INSTDIR\Jubilee.exe" "%1"'

  ; Create JubileeBrowserHTML class
  WriteRegStr SHCTX "Software\Classes\JubileeBrowserHTML" "" "Jubilee Browser HTML Document"
  WriteRegStr SHCTX "Software\Classes\JubileeBrowserHTML\DefaultIcon" "" "$INSTDIR\Jubilee.exe,0"
  WriteRegStr SHCTX "Software\Classes\JubileeBrowserHTML\shell\open\command" "" '"$INSTDIR\Jubilee.exe" "%1"'

  ; Create JubileeBrowserInspire class
  WriteRegStr SHCTX "Software\Classes\JubileeBrowserInspire" "" "Jubilee Browser Inspire Document"
  WriteRegStr SHCTX "Software\Classes\JubileeBrowserInspire\DefaultIcon" "" "$INSTDIR\Jubilee.exe,0"
  WriteRegStr SHCTX "Software\Classes\JubileeBrowserInspire\shell\open\command" "" '"$INSTDIR\Jubilee.exe" "%1"'

  ; Copy install log to application directory
  CopyFiles /SILENT $INSTALL_LOG_FILE "$INSTDIR\install.log"

  ; Log completion
  FileOpen $0 "$INSTDIR\install.log" a
  ${GetTime} "" "L" $1 $2 $3 $4 $5 $6 $7
  FileWrite $0 "[$3-$2-$1 $4:$5:$6] Installation completed successfully$\r$\n"
  FileClose $0
!macroend

; ============================================================================
; CUSTOM UNINSTALL ACTIONS
; ============================================================================

!macro customUnInstall
  ; Remove registry entries
  DeleteRegKey SHCTX "Software\JubileeBrowser"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "JubileeBrowser"
  DeleteRegKey SHCTX "Software\Classes\inspire"
  DeleteRegKey SHCTX "Software\Classes\JubileeBrowserHTML"
  DeleteRegKey SHCTX "Software\Classes\JubileeBrowserInspire"

  ; Note: User data in AppData is preserved by default (deleteAppDataOnUninstall: false)
  ; This allows users to reinstall without losing bookmarks, history, etc.
!macroend

; ============================================================================
; SILENT INSTALL SUPPORT
; ============================================================================

; The installer supports the following command-line options:
; /S              - Silent installation (no UI)
; /D=<path>       - Set install directory (must be last parameter)
; /NCRC           - Skip CRC check
; /ALLUSERS       - Install for all users (per-machine, requires admin)
; /CURRENTUSER    - Install for current user only (per-user, default)
; /LOG=<file>     - Write install log to specified file
;
; Example silent install commands:
;   JubileeSetup.exe /S
;   JubileeSetup.exe /S /CURRENTUSER
;   JubileeSetup.exe /S /ALLUSERS /D=C:\Program Files\Jubilee Browser
;   JubileeSetup.exe /S /LOG=C:\install.log

; ============================================================================
; REPAIR INSTALL SUPPORT
; ============================================================================

; Note: customHeader macro is not used to avoid NSIS scope issues
; Repair detection is handled via customInit registry check
