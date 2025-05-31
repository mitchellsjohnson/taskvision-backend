# TaskVision Backend

Backend API for TaskVision with custom domain and Route 53 support.

Last build: 2024-03-21 16:15 UTC

## Prerequisites

- Node.js 18.x
- AWS SAM CLI
- AWS CLI configured with appropriate credentials

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start local development server:
   ```bash
   npm run dev
   ```

3. Run tests:
   ```bash
   npm test
   ```

## Deployment

The backend is automatically deployed via GitHub Actions when changes are pushed to the main branch.

### Manual Deployment

To deploy manually:

1. Build the application:
   ```bash
   npm run build
   sam build
   ```

2. Deploy to AWS:
   ```bash
   sam deploy --guided
   ```

## Environment Variables

The following environment variables are required:

- `TABLE_NAME`: Name of the DynamoDB table
- `CLIENT_ORIGIN_URL`: Allowed CORS origin URL
- `AUTH0_DOMAIN`: Auth0 domain
- `AUTH0_AUDIENCE`: Auth0 audience
- `NODE_ENV`: Environment (development/production)

## API Documentation

The API is available at `https://api.taskvision.ai` when deployed.

## License

MIT

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
