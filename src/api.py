"""
FastAPI Backend Server - Production Ready
"""
import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from src.models import (
    UserRegister, UserLogin, UserResponse, StoryInput, StoryResponse, SceneOutput,
    SearchQuery, FilterQuery, CategorizeRequest
)
from pydantic import BaseModel as PydanticBaseModel, Field
from src.database import (
    init_db, create_user, get_user_by_email, get_user_by_id,
    create_story, get_story, get_user_stories, create_scene, get_story_scenes,
    log_agent_decision, log_user_query, create_report, set_metadata,
    update_story, delete_story, archive_story, update_user_username, update_user_password
)
from src.scene_generator import SceneGenerator
from src.image_generator import ImageGenerator
from src.analytics import AnalyticsEngine
from src.memory import AgentMemory
from src.config import settings
from src.auth import (
    verify_password, get_password_hash, create_access_token,
    get_user_id_from_token
)

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    init_db()
    logger.info("Application startup complete")
    yield
    # Shutdown
    logger.info("Application shutdown")

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# Configure rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if not settings.DEBUG:
        response.headers["X-Powered-By"] = ""
    return response

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Security
security = HTTPBearer(auto_error=False)

# Dependency to get current user with JWT
def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> int:
    """Get current user ID from JWT token"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    user_id = get_user_id_from_token(token)
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify user exists
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user_id

# Authentication Endpoints
@app.post("/api/auth/register", response_model=UserResponse)
@limiter.limit("10/minute")
async def register(request: Request, user_data: UserRegister):
    """Register a new user"""
    try:
        user_id = create_user(user_data.username, user_data.email, user_data.password)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or username already exists"
            )
        
        user = get_user_by_email(user_data.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve user after creation"
            )
        
        # Create access token
        access_token = create_access_token(data={"sub": str(user_id)})
        
        logger.info(f"User registered: {user_data.email}")
        
        return UserResponse(
            id=user["id"],
            username=user["username"],
            email=user["email"],
            plan=user["plan"],
            created_at=user["created_at"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin):
    """Login user"""
    try:
        user = get_user_by_email(credentials.email)
        if not user:
            logger.warning(f"Login attempt with non-existent email: {credentials.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        if not verify_password(credentials.password, user["password_hash"]):
            logger.warning(f"Invalid password attempt for: {credentials.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        # Create JWT token
        access_token = create_access_token(data={"sub": str(user["id"])})
        
        logger.info(f"User logged in: {credentials.email}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": UserResponse(
                id=user["id"],
                username=user["username"],
                email=user["email"],
                plan=user["plan"],
                created_at=user["created_at"]
            )
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


# Story Generation Endpoints
@app.post("/api/generate-scenes", response_model=StoryResponse)
@limiter.limit("5/minute")
async def generate_scenes(request: Request, story_input: StoryInput, user_id: int = Depends(get_current_user)):
    """Generate scenes from story prompt"""
    story_id = None
    try:
        # Limit max_scenes to 8
        max_scenes = min(story_input.max_scenes, 8)
        
        # Initialize generators
        analytics = AnalyticsEngine()
        memory = AgentMemory(user_id)
        
        # Get user preferences from memory
        preferences = memory.get_user_preferences()
        if preferences.get("preferred_style") and not story_input.style:
            story_input.style = preferences.get("preferred_style")
        
        # Classify the story
        classification = analytics.classify(story_input.prompt)
        genre = classification.get("genre", "Drama")
        style = story_input.style or preferences.get("preferred_style") or classification.get("style", "Cinematic")
        
        # Initialize scene generator
        scene_gen = SceneGenerator(max_scenes=max_scenes)
        
        # Generate title from prompt using LLM
        try:
            title = analytics.generate_title(story_input.prompt)
        except Exception as title_error:
            logger.warning(f"Title generation failed: {title_error}")
            words = story_input.prompt.split()[:6]
            title = " ".join(words) + ("..." if len(story_input.prompt.split()) > 6 else "")
            if len(title) > 50:
                title = title[:47] + "..."
        
        original_title = title
        
        # Create story record FIRST
        story_id = create_story(user_id, title, story_input.prompt, genre, style, original_title)
        
        # Update memory
        memory.story_id = story_id
        memory.add_message("user", story_input.prompt)
        
        # Log agent decision
        log_agent_decision(story_id, "genre_classification", json.dumps(classification), 0.8)
        
        # Generate scenes
        try:
            scenes_data = scene_gen.generate_scenes(story_input.prompt)
        except Exception as scene_error:
            error_msg = str(scene_error)
            if any(keyword in error_msg.lower() for keyword in ["quota", "429", "rate limit", "resourceexhausted"]):
                logger.warning(f"Scene generation failed due to quota: {scene_error}")
                scenes_data = [{
                    "scene_number": 1,
                    "scene_text": story_input.prompt[:200] + "..." if len(story_input.prompt) > 200 else story_input.prompt,
                    "cinematic_prompt": f"Cinematic scene: {story_input.prompt[:150]}"
                }]
            else:
                raise
        
        try:
            patterns = analytics.detect_patterns(scenes_data)
            log_agent_decision(story_id, "pattern_detection", json.dumps(patterns), patterns.get("visual_consistency_score", 0.7))
        except Exception as pattern_error:
            logger.warning(f"Pattern detection failed: {pattern_error}")
        
        try:
            summary = analytics.summarize(story_input.prompt, "story")
            set_metadata(story_id, "summary", summary)
        except Exception as summary_error:
            logger.warning(f"Summary generation failed: {summary_error}")
            summary = "Story summary unavailable"
        
        # Save scenes to database
        scene_outputs = []
        for scene_data in scenes_data:
            scene_id = create_scene(
                story_id,
                scene_data["scene_number"],
                scene_data["scene_text"],
                scene_data["cinematic_prompt"]
            )
            
            confidence = 0.8
            completeness = min(1.0, len(scene_data["scene_text"]) / 100)
            
            scene_outputs.append(SceneOutput(
                scene_number=scene_data["scene_number"],
                scene_text=scene_data["scene_text"],
                cinematic_prompt=scene_data["cinematic_prompt"],
                confidence_score=confidence,
                completeness_score=completeness
            ))
        
        # Update story status
        from src.database import get_db_connection
        conn = get_db_connection()
        try:
            conn.execute("UPDATE stories SET status = 'completed' WHERE id = ?", (story_id,))
            conn.commit()
        finally:
            conn.close()
        
        memory.add_message("assistant", f"Generated {len(scene_outputs)} scenes")
        
        logger.info(f"Story generated successfully: story_id={story_id}, user_id={user_id}")
        
        return StoryResponse(
            story_id=story_id,
            title=title,
            genre=genre,
            style=style,
            scenes=scene_outputs,
            summary=summary,
            total_scenes=len(scene_outputs),
            status="completed",
            created_at=datetime.now().isoformat(),
            original_title=original_title
        )
    
    except Exception as e:
        logger.error(f"Error generating scenes: {str(e)}", exc_info=True)
        if story_id:
            try:
                from src.database import get_db_connection
                conn = get_db_connection()
                try:
                    conn.execute("UPDATE stories SET status = 'failed' WHERE id = ?", (story_id,))
                    conn.commit()
                finally:
                    conn.close()
            except Exception:
                pass
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating scenes: {str(e)}"
        )


@app.post("/api/generate-images/{story_id}")
@limiter.limit("3/minute")
async def generate_images(request: Request, story_id: int, user_id: int = Depends(get_current_user)):
    """Generate images for scenes - handles rate limits gracefully"""
    story = get_story(story_id, user_id)
    if not story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    
    scenes = get_story_scenes(story_id)
    if not scenes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No scenes found")
    
    try:
        story_style = story.get("style", "Cinematic")
        image_gen = ImageGenerator(story_id=story_id, style=story_style)
        image_paths = []
        image_urls = []
        failed_scenes = []
        rate_limit_hit = False
        
        for scene in scenes:
            try:
                scene_dict = {
                    "scene_number": scene["scene_number"],
                    "scene_text": scene["scene_text"],
                    "cinematic_prompt": scene["cinematic_prompt"]
                }
                
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(image_gen.generate_image_for_scene, scene_dict)
                    try:
                        path = future.result(timeout=300)
                    except concurrent.futures.TimeoutError:
                        raise Exception("Image generation timed out after 5 minutes")
                
                image_paths.append(path)
                filename = os.path.basename(path)
                image_url = f"/scene_images/{filename}"
                image_urls.append(image_url)
                
                from src.database import get_db_connection
                conn = get_db_connection()
                try:
                    conn.execute("UPDATE scenes SET image_path = ?, image_url = ? WHERE id = ?", 
                                (path, image_url, scene["id"]))
                    conn.commit()
                finally:
                    conn.close()
                
            except Exception as scene_error:
                error_msg = str(scene_error)
                import traceback
                error_traceback = traceback.format_exc()
                logger.error(f"Error generating image for scene {scene['scene_number']}: {error_msg}")
                logger.debug(f"Full traceback: {error_traceback}")
                
                # Check for specific error types
                error_lower = error_msg.lower()
                if any(keyword in error_lower for keyword in ["429", "rate limit", "throttled", "quota", "resourceexhausted"]):
                    rate_limit_hit = True
                    logger.warning("Rate limit detected - stopping image generation")
                    break
                elif "timeout" in error_lower:
                    logger.warning(f"Timeout generating image for scene {scene['scene_number']}")
                    failed_scenes.append(scene["scene_number"])
                elif "no image returned" in error_lower or "runtimeerror" in error_lower:
                    logger.warning(f"API returned no image for scene {scene['scene_number']}")
                    failed_scenes.append(scene["scene_number"])
                else:
                    logger.warning(f"Unknown error for scene {scene['scene_number']}: {error_msg}")
                    failed_scenes.append(scene["scene_number"])
                continue
        
        if rate_limit_hit:
            return {
                "message": f"Rate limit reached. Generated {len(image_paths)}/{len(scenes)} images. Please wait and try again later.",
                "image_paths": image_paths,
                "image_urls": image_urls,
                "partial": True,
                "rate_limited": True,
                "completed": len(image_paths),
                "total": len(scenes)
            }
        
        if failed_scenes:
            return {
                "message": f"Generated {len(image_paths)}/{len(scenes)} images. Some scenes failed.",
                "image_paths": image_paths,
                "image_urls": image_urls,
                "partial": True,
                "failed_scenes": failed_scenes
            }
        
        logger.info(f"Images generated successfully for story_id={story_id}")
        return {
            "message": "Images generated successfully",
            "image_paths": image_paths,
            "image_urls": image_urls,
            "partial": False
        }
    
    except Exception as e:
        logger.error(f"Error generating images: {str(e)}", exc_info=True)
        error_msg = str(e)
        if any(keyword in error_msg.lower() for keyword in ["429", "rate limit", "throttled"]):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit reached. Please wait a moment and try again. Your story is saved and you can generate images later."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating images: {str(e)}"
        )


# History Endpoints
@app.get("/api/history")
async def get_history(user_id: int = Depends(get_current_user)):
    """Get user's story history"""
    stories = get_user_stories(user_id)
    return [{
        "id": s["id"],
        "title": s["title"],
        "genre": s["genre"],
        "style": s["style"],
        "status": s["status"],
        "created_at": s["created_at"]
    } for s in stories]


# Request Models
class UpdateStoryRequest(PydanticBaseModel):
    title: str


class UpdateUsernameRequest(PydanticBaseModel):
    username: str = Field(..., min_length=3, max_length=50)


class UpdatePasswordRequest(PydanticBaseModel):
    password: str = Field(..., min_length=6, max_length=100)


@app.get("/api/history/archived")
async def get_archived_history(user_id: int = Depends(get_current_user)):
    """Get user's archived story history"""
    from src.database import get_db_connection
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM stories WHERE user_id = ? AND archived = 1 ORDER BY created_at DESC",
            (user_id,)
        )
        stories = [dict(row) for row in cursor.fetchall()]
        return [{
            "id": s["id"],
            "title": s["title"],
            "genre": s["genre"],
            "style": s["style"],
            "status": s["status"],
            "created_at": s["created_at"]
        } for s in stories]
    finally:
        conn.close()


@app.put("/api/user/username")
async def update_username_endpoint(request: UpdateUsernameRequest, user_id: int = Depends(get_current_user)):
    """Update user's username"""
    if not request.username or len(request.username.strip()) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username must be at least 3 characters")
    
    success = update_user_username(user_id, request.username.strip())
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists or update failed")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    return UserResponse(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        plan=user["plan"],
        created_at=user["created_at"]
    )


@app.put("/api/user/password")
async def update_password_endpoint(request: UpdatePasswordRequest, user_id: int = Depends(get_current_user)):
    """Update user's password"""
    if not request.password or len(request.password.strip()) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters")
    
    success = update_user_password(user_id, request.password.strip())
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update password")
    
    return {"message": "Password updated successfully"}


@app.put("/api/story/{story_id}")
async def update_story_title_endpoint(
    story_id: int,
    request: UpdateStoryRequest,
    user_id: int = Depends(get_current_user)
):
    """Update story title"""
    if not request or not hasattr(request, 'title') or not request.title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
    
    success = update_story(story_id, user_id, request.title.strip())
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    
    return {"message": "Story updated successfully", "story_id": story_id}


@app.delete("/api/story/{story_id}")
async def delete_story_endpoint(
    story_id: int,
    user_id: int = Depends(get_current_user)
):
    """Delete a story"""
    story = get_story(story_id, user_id)
    if not story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    
    success = delete_story(story_id, user_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete story")
    
    return {"message": "Story deleted successfully", "story_id": story_id}


@app.post("/api/story/{story_id}/archive")
async def archive_story_endpoint(
    story_id: int,
    user_id: int = Depends(get_current_user)
):
    """Archive a story"""
    story = get_story(story_id, user_id)
    if not story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    
    success = archive_story(story_id, user_id, archived=True)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to archive story")
    
    return {"message": "Story archived successfully", "story_id": story_id}


@app.post("/api/story/{story_id}/unarchive")
async def unarchive_story_endpoint(
    story_id: int,
    user_id: int = Depends(get_current_user)
):
    """Unarchive a story"""
    story = get_story(story_id, user_id)
    if not story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    
    success = archive_story(story_id, user_id, archived=False)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to unarchive story")
    
    return {"message": "Story unarchived successfully", "story_id": story_id}


@app.get("/api/story/{story_id}/public")
async def get_story_public(story_id: int):
    """Get story details for sharing (public, no auth required)"""
    from src.database import get_db_connection
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM stories WHERE id = ?", (story_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
        story = dict(row)
    finally:
        conn.close()
    
    scenes_data = get_story_scenes(story_id)
    scenes = [SceneOutput(
        scene_number=s["scene_number"],
        scene_text=s["scene_text"],
        cinematic_prompt=s["cinematic_prompt"],
        image_path=s.get("image_path"),
        image_url=s.get("image_url"),
        confidence_score=0.8,
        completeness_score=0.8
    ) for s in scenes_data]
    
    from src.database import get_metadata
    summary = get_metadata(story_id, "summary")
    
    original_title = story.get("original_title") or story["title"]
    archived_status = story.get("archived", 0)
    if archived_status is None:
        archived_status = 0
    
    return StoryResponse(
        story_id=story["id"],
        title=story["title"],
        genre=story["genre"],
        style=story["style"],
        scenes=scenes,
        summary=summary,
        user_prompt=story.get("user_prompt", ""),
        total_scenes=len(scenes),
        status=story["status"],
        created_at=story["created_at"],
        original_title=original_title,
        archived=archived_status
    )


@app.get("/api/story/{story_id}", response_model=StoryResponse)
async def get_story_details(story_id: int, user_id: int = Depends(get_current_user)):
    """Get full story details (requires authentication)"""
    story = get_story(story_id, user_id)
    if not story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    
    scenes_data = get_story_scenes(story_id)
    scenes = [SceneOutput(
        scene_number=s["scene_number"],
        scene_text=s["scene_text"],
        cinematic_prompt=s["cinematic_prompt"],
        image_path=s.get("image_path"),
        image_url=s.get("image_url"),
        confidence_score=0.8,
        completeness_score=0.8
    ) for s in scenes_data]
    
    from src.database import get_metadata
    summary = get_metadata(story_id, "summary")
    
    original_title = story.get("original_title") or story["title"]
    archived_status = story.get("archived", 0)
    if archived_status is None:
        archived_status = 0
    
    return StoryResponse(
        story_id=story["id"],
        title=story["title"],
        genre=story["genre"],
        style=story["style"],
        scenes=scenes,
        summary=summary,
        user_prompt=story.get("user_prompt", ""),
        total_scenes=len(scenes),
        status=story["status"],
        created_at=story["created_at"],
        original_title=original_title,
        archived=archived_status
    )


# Query Endpoints
@app.post("/api/search")
async def search_stories(query: SearchQuery, user_id: int = Depends(get_current_user)):
    """Search stories by keywords"""
    stories = get_user_stories(user_id)
    results = [s for s in stories if query.query.lower() in s["title"].lower() or query.query.lower() in s.get("user_prompt", "").lower()]
    log_user_query(user_id, query.query, "search", len(results))
    return results


@app.post("/api/filter")
async def filter_stories(filter_query: FilterQuery, user_id: int = Depends(get_current_user)):
    """Filter stories by genre, style, date"""
    stories = get_user_stories(user_id)
    results = stories
    
    if filter_query.genre:
        results = [s for s in results if s.get("genre") == filter_query.genre]
    if filter_query.style:
        results = [s for s in results if s.get("style") == filter_query.style]
    
    log_user_query(user_id, json.dumps(filter_query.dict()), "filter", len(results))
    return results


@app.post("/api/categorize")
async def categorize_story(request: CategorizeRequest, user_id: int = Depends(get_current_user)):
    """Categorize a story"""
    analytics = AnalyticsEngine()
    classification = analytics.classify(request.story_text)
    log_user_query(user_id, request.story_text, "categorize", 1)
    return classification


# File Upload Endpoint
@app.post("/api/upload-file")
@limiter.limit("10/minute")
async def upload_file(request: Request, file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    """Upload and extract text from file (PDF, DOCX, TXT, or Images)"""
    from pathlib import Path
    
    # Validate file type
    allowed_extensions = {'.pdf', '.docx', '.txt', '.jpg', '.jpeg', '.png'}
    file_ext = Path(file.filename).suffix.lower() if file.filename else ''
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Allowed types: PDF, DOCX, TXT, JPG, PNG"
        )
    
    extracted_text = ""
    file_type = file_ext[1:] if file_ext else "unknown"
    
    try:
        contents = await file.read()
        
        # Check file size
        if len(contents) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size: {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
            )
        
        if file_ext == '.pdf':
            import PyPDF2
            from io import BytesIO
            pdf_file = BytesIO(contents)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            extracted_text = "\n".join([page.extract_text() for page in pdf_reader.pages])
            
        elif file_ext == '.docx':
            from docx import Document
            from io import BytesIO
            docx_file = BytesIO(contents)
            doc = Document(docx_file)
            extracted_text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            
        elif file_ext == '.txt':
            extracted_text = contents.decode('utf-8', errors='ignore')
            
        elif file_ext in {'.jpg', '.jpeg', '.png'}:
            extracted_text = f"[Image file: {file.filename}] Image analysis not yet implemented. Please provide a text description."
        
        extracted_text = extracted_text.strip()
        
        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text could be extracted from the file. Please ensure the file contains readable text."
            )
        
        if len(extracted_text) > 5000:
            extracted_text = extracted_text[:5000] + "... [truncated]"
        
        return {
            "filename": file.filename,
            "file_type": file_type,
            "extracted_text": extracted_text,
            "text_length": len(extracted_text),
            "message": f"File uploaded and processed successfully. Extracted {len(extracted_text)} characters."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing file: {str(e)}"
        )


# Health Check
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "timestamp": datetime.now().isoformat()
    }


# Serve static files (images) - Mount AFTER API routes
# Use absolute paths to ensure files are found in production
from pathlib import Path
BASE_DIR = Path(__file__).parent.parent

if os.path.exists("scene_images") or (BASE_DIR / "scene_images").exists():
    scene_images_path = "scene_images" if os.path.exists("scene_images") else str(BASE_DIR / "scene_images")
    app.mount("/scene_images", StaticFiles(directory=scene_images_path), name="scene_images")
    logger.info(f"Mounted scene_images at: {scene_images_path}")

if os.path.exists("output_scenes") or (BASE_DIR / "output_scenes").exists():
    output_scenes_path = "output_scenes" if os.path.exists("output_scenes") else str(BASE_DIR / "output_scenes")
    app.mount("/output_scenes", StaticFiles(directory=output_scenes_path), name="output_scenes")
    logger.info(f"Mounted output_scenes at: {output_scenes_path}")

# Find suggestion directory - check multiple possible locations
suggestion_paths = [
    "suggestion",  # Current directory
    str(BASE_DIR / "suggestion"),  # Project root
    "/app/suggestion",  # Railway absolute path
    os.path.join(os.getcwd(), "suggestion"),  # Current working directory
]

suggestion_found = None
for path in suggestion_paths:
    abs_path = os.path.abspath(path) if not os.path.isabs(path) else path
    if os.path.exists(abs_path) and os.path.isdir(abs_path):
        info_json = os.path.join(abs_path, "info.json")
        if os.path.exists(info_json):
            suggestion_found = abs_path
            logger.info(f"Found suggestion directory at: {suggestion_found}")
            logger.info(f"Verified info.json exists at: {info_json}")
            break
    else:
        logger.debug(f"Suggestion path not found: {abs_path}")

# Fallback: search for suggestion directory
if not suggestion_found:
    logger.warning("Suggestion directory not found in expected locations, searching...")
    for root, dirs, files in os.walk(BASE_DIR):
        if "suggestion" in dirs:
            potential_path = os.path.join(root, "suggestion")
            info_json = os.path.join(potential_path, "info.json")
            if os.path.exists(info_json):
                suggestion_found = os.path.abspath(potential_path)
                logger.info(f"Found suggestion directory via search at: {suggestion_found}")
                break

if suggestion_found:
    app.mount("/suggestion", StaticFiles(directory=suggestion_found), name="suggestion")
    logger.info(f"Mounted suggestion directory at: {suggestion_found}")
    # Verify info.json exists
    info_json_path = os.path.join(suggestion_found, "info.json")
    if os.path.exists(info_json_path):
        logger.info(f"Found info.json at: {info_json_path}")
        # List files in suggestion directory for debugging
        try:
            files = os.listdir(suggestion_found)
            logger.info(f"Suggestion directory contains {len(files)} files: {', '.join(files[:10])}")
        except Exception as e:
            logger.warning(f"Could not list suggestion directory: {e}")
    else:
        logger.error(f"info.json not found at: {info_json_path} even though directory exists!")
else:
    logger.warning("Suggestion directory not found in any expected location")
    # Try to find it anywhere
    for root, dirs, files in os.walk(BASE_DIR):
        if "info.json" in files and "suggestion" in root:
            found_path = os.path.dirname(os.path.join(root, "info.json"))
            logger.info(f"Found suggestion directory at: {found_path}")
            app.mount("/suggestion", StaticFiles(directory=found_path), name="suggestion")
            break

# Serve frontend static files
if os.path.exists("index.html") or (BASE_DIR / "index.html").exists():
    static_path = "." if os.path.exists("index.html") else str(BASE_DIR)
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
    logger.info(f"Mounted static files at: {static_path}")
