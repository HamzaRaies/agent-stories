"""
Configuration and Environment Variables
"""
import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field, validator


class Settings(BaseSettings):
    """Application settings with validation"""
    
    # API Configuration
    API_V1_PREFIX: str = "/api"
    PROJECT_NAME: str = "Story-to-Scene Generator API"
    VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    
    # Server Configuration
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8000, env="PORT")
    
    # Security
    SECRET_KEY: str = Field(default="", env="SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440, env="ACCESS_TOKEN_EXPIRE_MINUTES")  # 24 hours
    
    # CORS
    CORS_ORIGINS: List[str] = Field(default=["*"], env="CORS_ORIGINS")
    
    # Database
    DATABASE_URL: str = Field(default="sqlite:///./database/story_scenes.db", env="DATABASE_URL")
    
    # Google API
    GOOGLE_API_KEY: str = Field(..., env="GOOGLE_API_KEY")
    
    # File Upload
    MAX_UPLOAD_SIZE: int = Field(default=10485760, env="MAX_UPLOAD_SIZE")  # 10MB
    UPLOAD_DIR: str = Field(default="uploads", env="UPLOAD_DIR")
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = Field(default=True, env="RATE_LIMIT_ENABLED")
    RATE_LIMIT_PER_MINUTE: int = Field(default=60, env="RATE_LIMIT_PER_MINUTE")
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    
    @validator("CORS_ORIGINS", pre=True)
    def parse_cors_origins(cls, v):
        if v is None:
            return ["*"]
        if isinstance(v, str):
            if v == "*" or v == '["*"]':
                return ["*"]
            # Handle JSON array string like '["http://localhost:8080","https://example.com"]'
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return parsed
                except json.JSONDecodeError:
                    pass
            # Handle comma-separated string
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, list):
            return v
        return ["*"]
    
    @validator("SECRET_KEY", pre=True, always=True)
    def validate_secret_key(cls, v):
        if not v or len(v) < 32:
            # Generate a random secret key if not provided
            import secrets
            return secrets.token_urlsafe(32)
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Global settings instance
settings = Settings()

