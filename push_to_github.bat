@echo off
title Push to GitHub - DevanshLila/SIH2026 (Branch: devansh)
echo ========================================================
echo   Pushing AERORES-AI Project to GitHub
echo   Repository: https://github.com/DevanshLila/SIH2026
echo   Branch: devansh
echo ========================================================
set "PATH=C:\Users\LENOVO\AppData\Local\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"
git checkout devansh
git add .
git commit -m "feat: AERORES-AI Autonomous Rescue Drone Simulation (SIH 2026 - Qualcomm PS-26177)" 2>nul
git push -u origin devansh
echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo   [SUCCESS] Code successfully pushed to GitHub!
    echo   Branch URL: https://github.com/DevanshLila/SIH2026/tree/devansh
    echo ========================================================
) else (
    echo [NOTE] If this is your first time pushing, Git Credential Manager will open a browser window to sign in to GitHub.
)
pause
