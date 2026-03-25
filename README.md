frontend
- cd /frontend
- python3 -m http.server 3000
backend
- cd /backend
- source venv/bin/activate; uvicorn main:app --reload --host 0.0.0.0

How to deploy: Simply open your terminal, navigate to the fitnesspal root directory, and run: ./deploy_vercel.sh

⚠️ CRITICAL WARNINGS FOR PRODUCTION:

Database: SQLite or local un-exposed PostgreSQL DBs do not work on Vercel Serverless. You'll need to use a cloud database (like Supabase or Vercel Postgres) and add those Environment Variables (DB_USER, DB_PASSWORD, DB_HOST, etc.) directly into your Vercel Project Settings.
File Uploads (Photos): Currently, ai_service.py saves images to a local uploads/ directory on the server. Vercel's filesystem is read-only; any attempt to write an image to uploads/ in production will result in a 500 Internal Server Error. To fix this, you must integrate a cloud storage bucket like Amazon S3, Firebase Storage, or Vercel Blob to handle user photo uploads correctly.