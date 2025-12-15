# Railway Deployment Guide

This guide will help you deploy the Story-to-Scene Agent to Railway.

## Prerequisites

1. A Railway account (sign up at https://railway.app)
2. A Google Gemini API key
3. Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Prepare Your Repository

1. Ensure all files are committed to your repository
2. Make sure `.env` is in `.gitignore` (it should be already)

## Step 2: Deploy to Railway

### Option A: Deploy via Railway Dashboard

1. Go to https://railway.app and create a new project
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will automatically detect the project and start building

### Option B: Deploy via Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Link to existing project (if you have one)
railway link

# Deploy
railway up
```

## Step 3: Configure Environment Variables

In Railway dashboard, go to your service → Variables tab and add:

### Required Variables

```
GOOGLE_API_KEY=your_google_gemini_api_key_here
SECRET_KEY=generate-a-random-32-character-secret-key-here
```

### Optional Variables (with defaults)

```
DEBUG=False
PORT=8000
CORS_ORIGINS=*
DATABASE_URL=sqlite:///./database/story_scenes.db
ACCESS_TOKEN_EXPIRE_MINUTES=1440
RATE_LIMIT_ENABLED=True
RATE_LIMIT_PER_MINUTE=60
LOG_LEVEL=INFO
MAX_UPLOAD_SIZE=10485760
```

### Generate SECRET_KEY

You can generate a secure secret key using:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Or use an online generator: https://randomkeygen.com/

## Step 4: Configure Domain (Optional)

1. In Railway dashboard, go to your service → Settings
2. Click "Generate Domain" to get a public URL
3. Or add a custom domain in the "Domains" section

## Step 5: Update Frontend API URL

If your frontend is served separately:

1. Update `js/app.js` to use your Railway domain:
   ```javascript
   const API_BASE_URL = 'https://your-app.railway.app';
   ```

2. Or set it via environment variable in your frontend hosting

## Step 6: Verify Deployment

1. Check the deployment logs in Railway dashboard
2. Visit your Railway domain + `/api/health` to verify the API is running
3. Visit `/docs` (if DEBUG=True) to see the API documentation

## Troubleshooting

### Build Fails

- Check that all dependencies in `requirements.txt` are correct
- Verify Python version (Railway uses Python 3.11 by default)
- Check build logs for specific errors

### Database Issues

- Railway uses ephemeral storage, so database will reset on redeploy
- For production, consider using Railway PostgreSQL addon
- Update `DATABASE_URL` to use PostgreSQL connection string

### CORS Errors

- Update `CORS_ORIGINS` to include your frontend domain
- Format: `https://yourdomain.com,https://www.yourdomain.com`
- Don't use `*` in production if you need credentials

### Rate Limiting

- Adjust `RATE_LIMIT_PER_MINUTE` based on your needs
- Set `RATE_LIMIT_ENABLED=False` to disable (not recommended)

### Memory Issues

- Reduce number of workers in `Procfile` if needed
- Adjust timeout values
- Monitor Railway metrics

## Production Checklist

- [ ] Set `DEBUG=False`
- [ ] Set strong `SECRET_KEY` (32+ characters)
- [ ] Configure `CORS_ORIGINS` with specific domains
- [ ] Set up custom domain with SSL
- [ ] Configure database backup (if using SQLite, consider PostgreSQL)
- [ ] Set up monitoring and alerts
- [ ] Review and adjust rate limits
- [ ] Test all endpoints
- [ ] Update frontend API URL

## Scaling

Railway automatically scales based on traffic. For high-traffic applications:

1. Upgrade Railway plan if needed
2. Consider using Railway PostgreSQL for database
3. Use Railway Redis for caching (future enhancement)
4. Monitor metrics in Railway dashboard

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Project Issues: Check your repository issues

