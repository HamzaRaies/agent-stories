# PowerShell script to push code to GitHub
# Run this script when your internet connection is working

Write-Host "Checking git status..." -ForegroundColor Cyan
git status

Write-Host "`nSetting remote to SSH..." -ForegroundColor Cyan
git remote set-url origin git@github.com:Smmedy06/agent-stories.git

Write-Host "`nPushing to GitHub..." -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "Repository: https://github.com/Smmedy06/agent-stories" -ForegroundColor Green
} else {
    Write-Host "`n❌ Push failed. Please check:" -ForegroundColor Red
    Write-Host "1. Internet connection" -ForegroundColor Yellow
    Write-Host "2. SSH keys are set up (run: ssh -T git@github.com)" -ForegroundColor Yellow
    Write-Host "3. Repository exists and you have access" -ForegroundColor Yellow
}

