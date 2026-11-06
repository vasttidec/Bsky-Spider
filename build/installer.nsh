; Custom finish page for the assisted (oneClick: false) installer:
; both the desktop shortcut and "run app" choices live on the last page.
!include "MUI2.nsh"

!macro customFinishPage
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "打开 Bsky-Spider"
  !define MUI_FINISHPAGE_RUN_FUNCTION "BskyRunApplication"

  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "创建桌面快捷方式"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "BskyCreateDesktopShortcut"

  !insertmacro MUI_PAGE_FINISH

  Function BskyRunApplication
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd

  Function BskyCreateDesktopShortcut
    SetShellVarContext all
    CreateShortCut "$desktop\Bsky-Spider.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL "" "${APP_ID}"
  FunctionEnd
!macroend

; The installer itself does not create the desktop shortcut (createDesktopShortcut
; is disabled so that the finish page can decide), so remove it on uninstall.
!macro customUnInstall
  SetShellVarContext all
  Delete "$desktop\Bsky-Spider.lnk"
!macroend
