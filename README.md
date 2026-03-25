## How to run locally
frontend
- cd /frontend
- python3 -m http.server 3000

backend
- cd /backend
- source venv/bin/activate; uvicorn main:app --reload --host 0.0.0.0