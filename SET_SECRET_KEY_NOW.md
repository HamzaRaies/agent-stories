# ⚠️ URGENT: Set SECRET_KEY in Railway

## Why This is Critical

The warning you're seeing means:
- **Every time Railway restarts your app, ALL users get logged out**
- **All authentication tokens become invalid**
- **Users have to log in again after every deploy**

## Quick Fix (2 Minutes)

### Step 1: Generate a Secret Key

Run this command (or use the one I generated earlier):
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Or use this pre-generated key:**
```
jboJMHR7-wVFMoKdjTsi2CqHr3p2c0vxu62VJDS6c7o
```

### Step 2: Set in Railway

1. **Go to Railway Dashboard**: https://railway.app
2. **Click on your project**
3. **Click on your service** (the one running the app)
4. **Click "Variables" tab** (in the top menu)
5. **Click "New Variable"** button
6. **Enter:**
   - **Name**: `SECRET_KEY`
   - **Value**: `jboJMHR7-wVFMoKdjTsi2CqHr3p2c0vxu62VJDS6c7o` (or your generated key)
7. **Click "Add"**
8. **Railway will automatically redeploy**

### Step 3: Verify

After redeploy, check the logs:
- ✅ **SUCCESS**: No more SECRET_KEY warnings
- ❌ **FAILURE**: Warnings still appear (check variable name is exactly `SECRET_KEY`)

## What Happens After Setting It

- ✅ Users stay logged in across restarts
- ✅ No more login loops
- ✅ Tokens persist properly
- ✅ No more warnings in logs

## Troubleshooting

**Warning still appears?**
- Check the variable name is exactly `SECRET_KEY` (case-sensitive)
- Check there are no extra spaces
- Make sure you clicked "Add" and Railway redeployed
- Wait 1-2 minutes for redeploy to complete

**Need a new key?**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Security Note

- **Never commit SECRET_KEY to Git**
- **Keep it secret** - it's used to sign JWT tokens
- **Don't share it** publicly

