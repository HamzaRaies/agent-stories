# Frontend Deployment Guide

## Option 1: Backend Serves Frontend (Recommended)

The backend is configured to serve the frontend automatically. When you deploy to Railway:

1. The backend serves both API (`/api/*`) and frontend (`/`)
2. Frontend automatically detects the API URL from the current origin
3. No additional configuration needed

**Railway Deployment:**
- Deploy the entire project to Railway
- Set environment variables in Railway dashboard
- The frontend will be accessible at your Railway domain

## Option 2: Separate Frontend Deployment

If you want to deploy frontend separately (e.g., GitHub Pages):

### For GitHub Pages:

1. **Update API URL in `js/app.js`**:
   ```javascript
   const API_BASE_URL = 'https://your-railway-app.railway.app';
   ```

2. **Or use environment variable**:
   - Set `window.API_BASE_URL` before loading the script
   - Or use a build process to inject the URL

3. **Deploy to GitHub Pages**:
   - Go to repository Settings → Pages
   - Select source branch (usually `main`)
   - Select `/` (root) folder
   - Save

### For Railway (Frontend Only):

1. Create a separate Railway service for frontend
2. Update `API_BASE_URL` to point to your backend Railway URL
3. Deploy static files

## Current Configuration

The frontend is configured to:
- Use `window.API_BASE_URL` if set (for custom deployments)
- Auto-detect localhost for development
- Use current origin for production (works when backend serves frontend)

## Testing Locally

1. Start backend: `python main.py` (runs on http://localhost:8000)
2. Open `index.html` in browser or visit http://localhost:8000
3. Frontend will automatically connect to backend

## Production Setup

When deployed to Railway:
- Backend URL: `https://your-app.railway.app`
- Frontend URL: `https://your-app.railway.app` (same, served by backend)
- API URL: `https://your-app.railway.app/api`

The frontend will automatically use the correct API URL.

