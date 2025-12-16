# Environment Variables Setup for Railway

## Required Environment Variables

You need to set these environment variables in your Railway project:

### 1. SECRET_KEY (Optional but Recommended)
- **Description**: Secret key for JWT token signing
- **Default**: Auto-generated if not provided (32+ character random string)
- **Recommendation**: Set a strong secret key in production
- **How to generate**: Run `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### 2. GOOGLE_API_KEY (Required)
- **Description**: Your Google Gemini API key for image generation
- **Required**: Yes
- **Where to get**: Google Cloud Console / Gemini API

### 3. CORS_ORIGINS (Optional)
- **Description**: Comma-separated list of allowed CORS origins, or JSON array
- **Default**: `["*"]` (allows all origins)
- **Examples**:
  - Single origin: `http://localhost:8080`
  - Multiple origins: `http://localhost:8080,https://yourdomain.com`
  - JSON array: `["http://localhost:8080","https://yourdomain.com"]`
  - Allow all: `*` or `["*"]`

### 4. DATABASE_URL (Optional)
- **Description**: SQLite database path
- **Default**: `sqlite:///./database/story_scenes.db`
- **Note**: Railway will use the default if not set

### 5. DEBUG (Optional)
- **Description**: Enable debug mode
- **Default**: `False`
- **Values**: `True` or `False`

### 6. LOG_LEVEL (Optional)
- **Description**: Logging level
- **Default**: `INFO`
- **Values**: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on your service
3. Go to the "Variables" tab
4. Click "New Variable"
5. Add each variable with its value
6. Click "Deploy" to apply changes

## Minimum Required Setup

For the application to work, you **must** set at minimum:
- `GOOGLE_API_KEY` (required)

The following will be auto-generated if not set:
- `SECRET_KEY` (auto-generated, but recommended to set manually in production)

## Example Railway Environment Variables

```
GOOGLE_API_KEY=your_google_api_key_here
SECRET_KEY=your_generated_secret_key_here_min_32_chars
CORS_ORIGINS=["*"]
DEBUG=False
LOG_LEVEL=INFO
```

## Security Notes

1. **SECRET_KEY**: In production, always set a strong, randomly generated secret key. Never use the auto-generated one in production if you need to restart the service (it will change).

2. **CORS_ORIGINS**: In production, restrict CORS to your actual frontend domain(s) instead of using `["*"]`.

3. **GOOGLE_API_KEY**: Keep this secret and never commit it to version control.

