!ifndef APP_NAME
  !define APP_NAME "Nocode X Studio"
!endif

!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif

!ifndef APP_EXE
  !error "APP_EXE is required. Pass /DAPP_EXE=... to makensis"
!endif

!ifndef APP_BINARY_NAME
  !define APP_BINARY_NAME "nocode-x-studio-win_x64.exe"
!endif

!ifndef OUTPUT_FILE
  !define OUTPUT_FILE "dist\Nocode-X-Studio-Setup.exe"
!endif

!ifndef APP_ICON
  !define APP_ICON "installer\assets\app.ico"
!endif

Name "${APP_NAME} ${APP_VERSION}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\${APP_NAME}"
RequestExecutionLevel user
Unicode True
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"
ShowInstDetails show
ShowUninstDetails show

!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "${APP_EXE}"
  File /oname=app.ico "${APP_ICON}"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_BINARY_NAME}" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_BINARY_NAME}" "" "$INSTDIR\app.ico" 0

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$INSTDIR\${APP_BINARY_NAME}"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\Uninstall.exe"

  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  DeleteRegKey HKCU "${UNINST_KEY}"
  RMDir "$INSTDIR"
SectionEnd
