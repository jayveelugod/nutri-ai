#!/bin/bash

echo "🚀 Preparing to deploy NutriAI to Vercel..."

# Check if npm is installed
if ! command -v npm &> /dev/null
then
    echo "❌ Error: npm is not installed. Please install Node.js and npm first."
    exit 1
fi

echo "📦 Installing Vercel CLI globally..."
npm install -g vercel

echo "✅ Vercel CLI installed. Starting deployment..."
echo "Note: The first time you run this, you will need to log in and answer a few setup questions."

# Deploy
vercel --prod

echo ""
echo "🎉 Deployment complete!"