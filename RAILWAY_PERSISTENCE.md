# Railway Database Persistence Setup

## Problem
Railway's filesystem is **ephemeral** by default, meaning files (including SQLite databases) are deleted when the service restarts or redeploys. This causes:
- Users being deleted on each redeploy
- Stories and data being lost
- Tokens being invalidated (if SECRET_KEY changes)

## Solutions

### Option 1: Use Railway Volumes (Recommended)
Railway provides persistent volumes that survive redeployments:

1. **Create a Volume**:
   - Go to your Railway project
   - Click "New" → "Volume"
   - Name it `database-volume`
   - Mount it at `/data`

2. **Update Database Path**:
   Set environment variable:
   ```
   DATABASE_URL=sqlite:////data/story_scenes.db
   ```

3. **Update Code** (if needed):
   The code already uses `DATABASE_URL` from config, so just set the environment variable.

### Option 2: Use External Database (Best for Production)
Use PostgreSQL or another managed database:

1. **Add PostgreSQL Service**:
   - In Railway, click "New" → "Database" → "Add PostgreSQL"
   - Railway will provide a `DATABASE_URL` automatically

2. **Update Code**:
   - Change from SQLite to PostgreSQL
   - Update `src/database.py` to use SQLAlchemy with PostgreSQL

### Option 3: Set SECRET_KEY (Critical!)
**IMPORTANT**: Even if you fix the database, you MUST set `SECRET_KEY`:

1. **Generate a Secret Key**:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. **Set in Railway**:
   - Go to your Railway project
   - Variables tab
   - Add: `SECRET_KEY` = (your generated key)

3. **Why This Matters**:
   - If `SECRET_KEY` is not set, it auto-generates on each restart
   - This invalidates ALL existing JWT tokens
   - Users get logged out immediately

## Current Status

The code now:
- ✅ Uses absolute paths for database (more reliable)
- ✅ Warns if SECRET_KEY is auto-generated
- ✅ Creates database directory if it doesn't exist

**You MUST**:
- ❌ Set `SECRET_KEY` environment variable in Railway
- ❌ Set up a Railway Volume for database persistence (or use PostgreSQL)

## Quick Fix (Temporary)

For testing, you can:
1. Set `SECRET_KEY` in Railway variables (prevents token invalidation)
2. Accept that data will be lost on redeploy (use volumes for persistence)

## Verification

After setting up:
1. Check Railway logs for: `Database initialized successfully`
2. Check Railway logs for: `SECRET_KEY was auto-generated` (should NOT appear if set correctly)
3. Create a user and verify it persists after redeploy

