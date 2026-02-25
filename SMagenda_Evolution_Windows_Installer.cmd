@echo off
setlocal

set "SCRIPT=%~dp0SMagenda_Evolution_Windows_Installer.ps1"

if not exist "%SCRIPT%" (
  echo [SMagenda] Nao encontrei o instalador PowerShell: %SCRIPT%
  echo [SMagenda] Coloque este .cmd na mesma pasta do .ps1 e tente novamente.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
exit /b %ERRORLEVEL%

