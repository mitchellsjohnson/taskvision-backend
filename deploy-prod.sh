#!/bin/bash
# Production deployment script - requires explicit confirmation
# Usage: ./deploy-prod.sh

echo "🚨 PRODUCTION DEPLOYMENT CONFIRMATION"
echo "Are you sure you want to deploy to production?"
echo "This will affect live users."
read -p "Type DEPLOY TO PRODUCTION to confirm: " confirm

if [ "$confirm" != "DEPLOY TO PRODUCTION" ]; then
  echo "❌ Production deployment cancelled"
  exit 1
fi

echo "🚀 Deploying to PRODUCTION..."
git checkout main
git merge dev
git push origin main

echo "✅ Deployed to PRODUCTION"
echo "🎉 Live users will see changes shortly"

