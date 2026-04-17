# Windows Environment Setup Script for Nutri-AI
# Ensure you are running this script using a regular PowerShell prompt or VS Code terminal.
# It is recommended to run as Administrator so winget can install software smoothly.

Write-Host "Starting Nutri-AI Windows Setup..." -ForegroundColor Green

# 1. Install Python 3.11
Write-Host "`n[1/5] Installing Python via winget..." -ForegroundColor Yellow
winget install -e --id Python.Python.3.11 --accept-source-agreements --accept-package-agreements
Write-Host "Python installation complete or already installed." -ForegroundColor Green

# 2. Install PostgreSQL
Write-Host "`n[2/5] Installing PostgreSQL via winget..." -ForegroundColor Yellow
winget install -e --id PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements
Write-Host "PostgreSQL installation complete or already installed." -ForegroundColor Green
Write-Host "Note: PostgreSQL usually requires you to set up a 'postgres' user password during its graphical installer phase or post-install. Please complete that if the installer window opened." -ForegroundColor Cyan

# 3. Install Node.js
Write-Host "`n[3/5] Installing Node.js via winget..." -ForegroundColor Yellow
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
Write-Host "Node.js installation complete or already installed." -ForegroundColor Green

# Refresh Environment Variables in the current terminal to pick up Python and Node.js
Write-Host "`nRefreshing Environment Variables..." -ForegroundColor Yellow
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 4. Install Vercel CLI
Write-Host "`n[4/5] Installing Vercel CLI via npm..." -ForegroundColor Yellow
try {
    # If npm fails, it may be because of script execution policies or PATH not fully reflecting Node.js folder yet.
    npm install -g vercel
    Write-Host "Vercel CLI installed successfully." -ForegroundColor Green
} catch {
    Write-Host "Could not automatically install Vercel CLI. If Node.js just installed, restart your terminal and run: npm install -g vercel" -ForegroundColor Red
}

# 5. Setup Python Virtual Environment and Install Dependencies
$rootDir = $PSScriptRoot
if (Test-Path "$rootDir\requirements.txt") {
    Write-Host "`n[5/5] Setting up Python Virtual Environment in root directory..." -ForegroundColor Yellow
    Push-Location $rootDir
    
    # Try using python, if it's not found (due to not being in Path yet), try py or direct path
    try {
        python -m venv venv
    } catch {
        Write-Host "Couldn't find 'python' command. Attempting 'py'..." -ForegroundColor Yellow
        py -m venv venv
    }
    
    if (Test-Path ".\venv\Scripts\python.exe") {
        Write-Host "Virtual environment created." -ForegroundColor Green
        
        Write-Host "Installing Python dependencies from requirements.txt..." -ForegroundColor Yellow
        .\venv\Scripts\python.exe -m pip install --upgrade pip
        .\venv\Scripts\python.exe -m pip install -r requirements.txt
        Write-Host "Python dependencies installed successfully." -ForegroundColor Green
    } else {
        Write-Host "Failed to create virtual environment. You may need to restart your terminal to load the new Python PATH and try again." -ForegroundColor Red
    }
    
    Pop-Location
} else {
    Write-Host "`n[5/5] requirements.txt not found in root. Skipping Python dependencies installation." -ForegroundColor Red
}

Write-Host "`nSetup has finished!" -ForegroundColor Green