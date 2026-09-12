Unicode true
ManifestDPIAware true

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!ifndef APP_BINARY
  !error "APP_BINARY is required"
!endif
!ifndef WEBVIEW2_BOOTSTRAPPER
  !error "WEBVIEW2_BOOTSTRAPPER is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif
!ifndef APP_VERSION
  !define APP_VERSION "1.4.6"
!endif

!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "Lumi Client"
!endif
!ifndef PRODUCT_ID
  !define PRODUCT_ID "cn.lumi.familyhub"
!endif
!ifndef MAIN_BINARY
  !define MAIN_BINARY "lumi-client.exe"
!endif
!ifndef INSTALL_SUBDIR
  !define INSTALL_SUBDIR "LumiClient"
!endif
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_ID}"
!define WEBVIEW2_GUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

Name "${PRODUCT_NAME}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\${INSTALL_SUBDIR}"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"
!ifdef SERVER_CORE_BINARY
  RequestExecutionLevel admin
  !define SERVER_API_PORT "2521"
  !define SERVER_FIREWALL_RULE "Lumi Server LAN API"
!else
  RequestExecutionLevel user
!endif
SetCompressor /SOLID lzma
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "Lumi"

Var RestartAfterInstall

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${MAIN_BINARY}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  StrCpy $RestartAfterInstall "0"
  ClearErrors
  ${GetOptions} $CMDLINE "/R" $0
  ${IfNot} ${Errors}
    StrCpy $RestartAfterInstall "1"
  ${EndIf}
FunctionEnd

Function EnsureWebView2
  StrCpy $0 ""
  SetRegView 64
  ReadRegStr $0 HKLM "Software\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_GUID}" "pv"
  ${If} $0 == ""
    SetRegView 32
    ReadRegStr $0 HKLM "Software\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_GUID}" "pv"
  ${EndIf}
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\${WEBVIEW2_GUID}" "pv"
  ${EndIf}
  ${If} $0 == ""
    SetOutPath "$TEMP"
    File "/oname=FamilyHub-WebView2-Setup.exe" "${WEBVIEW2_BOOTSTRAPPER}"
    ExecWait '"$TEMP\FamilyHub-WebView2-Setup.exe" /silent /install' $1
    Delete "$TEMP\FamilyHub-WebView2-Setup.exe"
  ${EndIf}
FunctionEnd

Section "Install"
  SetShellVarContext current

  nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\taskkill.exe" /F /IM "${MAIN_BINARY}"'
  Pop $0
  Pop $1
  !ifdef SERVER_CORE_BINARY
    nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\taskkill.exe" /F /IM "${SERVER_CORE_BINARY}"'
    Pop $0
    Pop $1
  !endif

  SetOutPath "$INSTDIR"
  File "/oname=${MAIN_BINARY}" "${APP_BINARY}"
  !ifdef SERVER_CORE_DIR
    SetOutPath "$INSTDIR\lumi-server-core"
    File /r "${SERVER_CORE_DIR}\*"
    SetOutPath "$INSTDIR"
    nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="${SERVER_FIREWALL_RULE}"'
    Pop $0
    Pop $1
    nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="${SERVER_FIREWALL_RULE}" dir=in action=allow protocol=TCP localport=${SERVER_API_PORT} program="$INSTDIR\lumi-server-core\${SERVER_CORE_BINARY}" profile=private remoteip=LocalSubnet enable=yes'
    Pop $0
    Pop $1
  !endif
  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${MAIN_BINARY}"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${MAIN_BINARY}"

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Lumi"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${MAIN_BINARY}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  Call EnsureWebView2
SectionEnd

Function .onInstSuccess
  ${If} $RestartAfterInstall == "1"
    ExecShell "open" "$INSTDIR\${MAIN_BINARY}"
  ${EndIf}
FunctionEnd

Section "Uninstall"
  SetShellVarContext current

  nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\taskkill.exe" /F /IM "${MAIN_BINARY}"'
  Pop $0
  Pop $1
  !ifdef SERVER_CORE_BINARY
    nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\taskkill.exe" /F /IM "${SERVER_CORE_BINARY}"'
    Pop $0
    Pop $1
  !endif

  Delete "$INSTDIR\${MAIN_BINARY}"
  !ifdef SERVER_CORE_DIR
    nsExec::ExecToStack /TIMEOUT=10000 '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="${SERVER_FIREWALL_RULE}"'
    Pop $0
    Pop $1
    RMDir /r "$INSTDIR\lumi-server-core"
  !endif
  Delete "$INSTDIR\uninstall.exe"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
