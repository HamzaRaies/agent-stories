"""
Database Operations using SQLAlchemy
"""
import sqlite3
import os
from typing import Optional, List, Dict
from pathlib import Path

# Use absolute path and ensure database directory exists
BASE_DIR = Path(__file__).parent.parent

# Try to get database path from config, otherwise use default
try:
    from src.config import settings
    if settings.DATABASE_URL and settings.DATABASE_URL.startswith("sqlite"):
        # Extract path from sqlite:///path/to/db.db
        db_path = settings.DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
        if db_path and not db_path.startswith(":memory:"):
            DATABASE_PATH = db_path
        else:
            # Use default path
            DATABASE_DIR = BASE_DIR / "database"
            DATABASE_DIR.mkdir(exist_ok=True)
            DATABASE_PATH = str(DATABASE_DIR / "story_scenes.db")
    else:
        # Use default path
        DATABASE_DIR = BASE_DIR / "database"
        DATABASE_DIR.mkdir(exist_ok=True)
        DATABASE_PATH = str(DATABASE_DIR / "story_scenes.db")
except ImportError:
    # Fallback if config not available
    DATABASE_DIR = BASE_DIR / "database"
    DATABASE_DIR.mkdir(exist_ok=True)
    DATABASE_PATH = str(DATABASE_DIR / "story_scenes.db")


def get_db_connection():
    """Get SQLite database connection"""
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database with schema"""
    schema_path = os.path.join(os.path.dirname(__file__), '..', 'database', 'schema.sql')
    conn = get_db_connection()
    with open(schema_path, 'r') as f:
        conn.executescript(f.read())
    
    # Migration: Add original_title column if it doesn't exist
    cursor = conn.cursor()
    # Check if column exists
    cursor.execute("PRAGMA table_info(stories)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if "original_title" not in columns:
        try:
            cursor.execute("ALTER TABLE stories ADD COLUMN original_title TEXT")
            conn.commit()
            print("Added original_title column to stories table")
        except sqlite3.OperationalError as e:
            print(f"Error adding original_title column: {e}")
    
    # For existing stories without original_title, set it to current title
    # This ensures old stories have an original_title value
    try:
        cursor.execute("""
            UPDATE stories 
            SET original_title = title 
            WHERE original_title IS NULL OR original_title = ''
        """)
        conn.commit()
        updated_count = cursor.rowcount
        if updated_count > 0:
            print(f"Updated {updated_count} existing stories with original_title")
    except Exception as update_error:
        pass
    
    if "archived" not in columns:
        try:
            cursor.execute("ALTER TABLE stories ADD COLUMN archived INTEGER DEFAULT 0")
            conn.commit()
            print("Added archived column to stories table")
        except sqlite3.OperationalError as e:
            print(f"Error adding archived column: {e}")
    
    conn.close()
    print("Database initialized successfully")

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    from src.auth import get_password_hash
    return get_password_hash(password)

def create_user(username: str, email: str, password: str) -> Optional[int]:
    """Create a new user"""
    conn = get_db_connection()
    try:
        password_hash = hash_password(password)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, password_hash)
        )
        user_id = cursor.lastrowid
        conn.commit()
        return user_id
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> Optional[Dict]:
    """Get user by ID"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash"""
    from src.auth import verify_password as verify_pwd
    return verify_pwd(password, password_hash)

def update_user_username(user_id: int, new_username: str) -> bool:
    """Update user's username"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET username = ? WHERE id = ?",
            (new_username.strip(), user_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    except sqlite3.IntegrityError:
        # Username already exists
        return False
    finally:
        conn.close()

def update_user_password(user_id: int, new_password: str) -> bool:
    """Update user's password"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        password_hash = hash_password(new_password)
        cursor.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error updating password: {e}")
        return False
    finally:
        conn.close()

# Story Operations
def create_story(user_id: int, title: str, user_prompt: str, genre: Optional[str] = None, style: Optional[str] = None, original_title: Optional[str] = None) -> int:
    """Create a new story"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # If original_title not provided, use title as original_title
        original_title = original_title or title
        cursor.execute(
            "INSERT INTO stories (user_id, title, original_title, user_prompt, genre, style) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, title, original_title, user_prompt, genre, style)
        )
        story_id = cursor.lastrowid
        conn.commit()
        return story_id
    finally:
        conn.close()

def get_story(story_id: int, user_id: int) -> Optional[Dict]:
    """Get story by ID (user-specific)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM stories WHERE id = ? AND user_id = ?", (story_id, user_id))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()

def get_user_stories(user_id: int, limit: int = 50, include_archived: bool = False) -> List[Dict]:
    """Get all stories for a user (optionally include archived)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if include_archived:
            cursor.execute(
                "SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            )
        else:
            cursor.execute(
                "SELECT * FROM stories WHERE user_id = ? AND (archived = 0 OR archived IS NULL) ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def update_story(story_id: int, user_id: int, title: Optional[str] = None) -> bool:
    """Update story title"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if title:
            cursor.execute(
                "UPDATE stories SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (title, story_id, user_id)
            )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def archive_story(story_id: int, user_id: int, archived: bool = True) -> bool:
    """Archive or unarchive a story"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE stories SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (1 if archived else 0, story_id, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def delete_story(story_id: int, user_id: int) -> bool:
    """Delete a story and all its scenes"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Delete scenes first (foreign key constraint)
        cursor.execute("DELETE FROM scenes WHERE story_id = ?", (story_id,))
        # Delete story
        cursor.execute("DELETE FROM stories WHERE id = ? AND user_id = ?", (story_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# Scene Operations
def create_scene(story_id: int, scene_number: int, scene_text: str, cinematic_prompt: str, 
                 image_path: Optional[str] = None, image_url: Optional[str] = None) -> int:
    """Create a scene"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO scenes (story_id, scene_number, scene_text, cinematic_prompt, image_path, image_url)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (story_id, scene_number, scene_text, cinematic_prompt, image_path, image_url)
        )
        scene_id = cursor.lastrowid
        conn.commit()
        return scene_id
    finally:
        conn.close()

def get_story_scenes(story_id: int) -> List[Dict]:
    """Get all scenes for a story"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scenes WHERE story_id = ? ORDER BY scene_number", (story_id,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

# Conversation Operations
def add_conversation(story_id: Optional[int], user_id: int, role: str, message: str):
    """Add a conversation message"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (story_id, user_id, role, message) VALUES (?, ?, ?, ?)",
            (story_id, user_id, role, message)
        )
        conn.commit()
    finally:
        conn.close()

# Agent Decision Operations
def log_agent_decision(story_id: int, decision_type: str, decision_data: str, confidence_score: Optional[float] = None):
    """Log an agent decision"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO agent_decisions (story_id, decision_type, decision_data, confidence_score)
               VALUES (?, ?, ?, ?)""",
            (story_id, decision_type, decision_data, confidence_score)
        )
        conn.commit()
    finally:
        conn.close()

# Query Operations
def log_user_query(user_id: int, query_text: str, query_type: str, results_count: int):
    """Log a user query"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO user_queries (user_id, query_text, query_type, results_count) VALUES (?, ?, ?, ?)",
            (user_id, query_text, query_type, results_count)
        )
        conn.commit()
    finally:
        conn.close()

# Report Operations
def create_report(story_id: int, report_type: str, report_data: str) -> int:
    """Create a report"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO reports (story_id, report_type, report_data) VALUES (?, ?, ?)",
            (story_id, report_type, report_data)
        )
        report_id = cursor.lastrowid
        conn.commit()
        return report_id
    finally:
        conn.close()

# Metadata Operations
def set_metadata(story_id: int, key: str, value: str):
    """Set metadata for a story"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO metadata (story_id, key, value) VALUES (?, ?, ?)",
            (story_id, key, value)
        )
        conn.commit()
    finally:
        conn.close()

def get_metadata(story_id: int, key: str) -> Optional[str]:
    """Get metadata for a story"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM metadata WHERE story_id = ? AND key = ?", (story_id, key))
        row = cursor.fetchone()
        if row:
            return row[0]
        return None
    finally:
        conn.close()