@echo off
echo Checking git status...
git status

echo.
echo Setting remote to SSH...
git remote set-url origin git@github.com:Smmedy06/agent-stories.git

echo.
echo Pushing to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo Successfully pushed to GitHub!
    echo Repository: https://github.com/Smmedy06/agent-stories
) else (
    echo.
    echo Push failed. Please check:
    echo 1. Internet connection
    echo 2. SSH keys are set up
    echo 3. Repository exists and you have access
)

pause

