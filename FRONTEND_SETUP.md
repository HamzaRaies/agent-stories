# Frontend Setup Guide

## ✅ Current Configuration

Your frontend is **already configured** to work automatically! Here's how:

### How It Works

1. **Backend Serves Frontend**: The FastAPI backend is configured to serve `index.html` and all static files
2. **Auto-Detection**: The frontend automatically detects the API URL:
   - Development: Uses `http://localhost:8000` if on localhost
   - Production: Uses `window.location.origin` (same domain as frontend)

### When Deployed to Railway

1. Deploy the entire project to Railway
2. Set environment variables (see `DEPLOYMENT.md`)
3. Access your app at: `https://your-app.railway.app`
4. Frontend automatically connects to: `https://your-app.railway.app/api`

**No additional configuration needed!** ✅

## 🔧 Manual Configuration (If Needed)

If you want to deploy frontend separately or use a different backend URL:

### Option 1: Set API URL via HTML

Add this before loading `app.js` in `index.html`:

```html
<script>
  window.API_BASE_URL = 'https://your-backend-url.railway.app';
</script>
<script src="js/app.js"></script>
```

### Option 2: Environment Variable (Build Process)

If using a build tool, inject the API URL during build:

```javascript
const API_BASE_URL = process.env.API_BASE_URL || window.location.origin;
```

### Option 3: GitHub Pages (Separate Frontend)

If deploying frontend to GitHub Pages:

1. Update `js/app.js` line 33:
   ```javascript
   const API_BASE_URL = 'https://your-railway-backend.railway.app';
   ```

2. Deploy to GitHub Pages:
   - Repository Settings → Pages
   - Source: `main` branch, `/` folder

## 📋 Current Code Location

The API URL configuration is in:
- **File**: `js/app.js`
- **Line**: 33
- **Current Code**:
  ```javascript
  const API_BASE_URL = window.API_BASE_URL || 
    (window.location.origin.includes('localhost') 
      ? 'http://localhost:8000' 
      : window.location.origin);
  ```

This means:
- ✅ Works automatically when backend serves frontend
- ✅ Works in development (localhost)
- ✅ Can be overridden with `window.API_BASE_URL`

## 🚀 Deployment Steps

### For Railway (Recommended - Single Deployment)

1. Push code to GitHub (✅ Done!)
2. Connect Railway to your GitHub repo
3. Set environment variables in Railway
4. Deploy
5. Access your app - frontend works automatically!

### For Separate Deployments

1. **Backend on Railway**:
   - Deploy backend
   - Get Railway URL: `https://your-backend.railway.app`

2. **Frontend on GitHub Pages**:
   - Update `js/app.js` with Railway backend URL
   - Push changes
   - Enable GitHub Pages
   - Frontend at: `https://hamzaraies.github.io/agent-stories`

## ✅ Verification

After deployment, verify:

1. **Frontend loads**: Visit your app URL
2. **API connects**: Check browser console for API calls
3. **Authentication works**: Try login/signup
4. **CORS**: If frontend on different domain, ensure CORS_ORIGINS includes it

## 🐛 Troubleshooting

### Frontend can't connect to API

1. Check browser console for errors
2. Verify `API_BASE_URL` is correct
3. Check CORS settings in backend
4. Verify backend is running and accessible

### CORS Errors

Update `CORS_ORIGINS` in Railway environment variables:
```
CORS_ORIGINS=https://your-frontend-domain.com,https://www.your-frontend-domain.com
```

### 404 on API calls

1. Verify backend is deployed
2. Check API endpoint URLs
3. Ensure `/api` prefix is correct

## 📝 Summary

**Your frontend is ready to work!** The current configuration:
- ✅ Auto-detects API URL
- ✅ Works with backend serving frontend
- ✅ Works in development
- ✅ Can be customized if needed

Just deploy to Railway and it will work! 🎉

