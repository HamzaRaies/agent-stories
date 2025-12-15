"""
Main entry point - Run the FastAPI server
"""
import uvicorn
from src.config import settings

if __name__ == "__main__":
    print(f"Starting {settings.PROJECT_NAME}...")
    print(f"API will be available at http://{settings.HOST}:{settings.PORT}")
    if settings.DEBUG:
        print(f"API docs at http://{settings.HOST}:{settings.PORT}/docs")
    uvicorn.run(
        "src.api:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )