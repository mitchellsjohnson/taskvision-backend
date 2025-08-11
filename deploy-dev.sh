#!/bin/bash
# Safe deployment script - pushes to dev branch only
# Usage: ./deploy-dev.sh "commit message"

if [ -z "$1" ]; then
  echo "Error: Please provide a commit message"
  echo "Usage: ./deploy-dev.sh \"your commit message\""
  exit 1
fi

echo "🚀 Deploying to DEV environment..."
git add .
git commit -m "$1"
git push origin dev

echo "✅ Deployed to DEV branch"
echo "⚠️  To deploy to production, manually run: git checkout main && git merge dev && git push origin main"

