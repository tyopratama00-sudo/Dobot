@echo off
REM Double-click buat nyalain semua service. Argumen diteruskan ke start.ps1,
REM misal: start.bat -Clean -NoRobot #
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
