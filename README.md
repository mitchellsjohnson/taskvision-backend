# TaskVision Backend

Last build trigger: $(date)

## 🧪 Local Development & Deployment (Backend)

To test and deploy your backend locally using AWS SAM:

### 🛠️ Step 1: Setup Local Config

Create your personal, untracked SAM config file:

```bash
cp .samconfig.dev.toml.example .samconfig.dev.toml
```

Then edit `.samconfig.dev.toml` and fill in your environment-specific values:


> ⚠️ **Do NOT commit `.samconfig.dev.toml`** — it's already ignored via `.gitignore`.

---

### 🚀 Step 2: Build and Deploy Locally

```bash
sam build
sam deploy --config-file .samconfig.dev.toml --config-env dev
```

This builds and deploys your local changes to the `dev` stack in AWS.

---

### 📤 Step 3: Push to GitHub for CI/CD Deployment

After local verification, push your changes:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

GitHub Actions will:
- Use `secrets` defined in the `dev` environment
- Automatically deploy via `sam deploy`

> 💡 See `.github/workflows/deploy.yml` for the CI deployment logic.

# Tue May 28 13:45:00 EDT 2025
