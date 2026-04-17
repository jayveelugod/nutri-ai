### Pre-requisites
- Python 3.11
- PostgreSQL
- Vercel CLI

run: 
1. `powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1`
2. Set postgres path: (open command prompt as admin)
    - `setx PATH "%PATH%;C:\Program Files\PostgreSQL\17\bin"`
3. Open C:\Program Files\PostgreSQL\17\data\pg_hba.conf in Notepad (Run as Administrator)
    Find lines like:

    host    all             all             127.0.0.1/32            md5
    host    all             all             ::1/128                 md5

    Change md5 → trust
4. Initialize the local database: 
    - `psql -U postgres -c "CREATE DATABASE nutriai_db;"` (hit Enter if asked for password, ensuring it remains empty)
5. `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## How to run locally (2 separate terminals)
frontend
- cd frontend
- ..\venv\Scripts\python.exe -m http.server 3000

backend
- cd backend
- ..\venv\Scripts\activate; python main.py