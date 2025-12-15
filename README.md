<div align="center">

# Story-to-Scene Agent

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=chainlink&logoColor=white)](https://python.langchain.com/)

**Transform your stories into cinematic visual experiences using AI.**

<p align="center">
  <a href="#features">Features</a> •
  <a href="#setup">Setup</a> •
  <a href="#project-structure">Structure</a> •
  <a href="#usage">Usage</a> •
  <a href="#technologies">Tech Stack</a>
</p>

</div>

---

## Features

- **Secure Authentication**: Full Login/Signup system with secure session management.
- **Intelligent Story Generation**: Converts simple prompts or uploaded documents (`.pdf`, `.docx`, `.txt`) into detailed, multi-scene cinematic scripts.
- **Consistency-Aware Image Generation**: Powered by **Google Gemini (Imagen 2.5)**, ensuring characters and styles remain consistent across every scene.
- **Real-time Interface**:
  - **Instant History**: New stories appear in your sidebar immediately.
  - **Live Previews**: See what the AI is reading from your files in real-time.
  - **Auto-Recovery**: Smart backend connection handling.
- **Advanced Agent Memory**: Remembers context across long conversations.
- **Deep Analytics**: Built-in summarization, classification, and narrative pattern detection.
- **Robust Database**: SQLite architecture managing stories, scenes, and user data.
- **Premium UI**: A beautiful, responsive, dark-mode-first interface designed for immersion.

---

## Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
# Google Gemini API Key (Required for Text & Images)
GOOGLE_API_KEY=your_gemini_api_key

# Database Connection
DATABASE_URL=sqlite:///./database/story_scenes.db
```

### 3. Initialize Database
Run this command to set up the SQLite schema:
```bash
python -c "from src.database import init_db; init_db()"
```

### 4. Application Launch

**Option A: Run with Script (Recommended)**
```bash
./run_server.sh
```

**Option B: Manual Start**
Terminal 1 (Backend):
```bash
uvicorn src.api:app --reload
```

Terminal 2 (Frontend):
```bash
cd ui && python -m http.server 8080
```
*Then visit `http://localhost:8080/ui/` in your browser.*

---

## Project Structure

```
project/
├── src/
│   ├── api.py              # FastAPI Backend
│   ├── scene_generator.py  # Story Logic (LangChain)
│   ├── image_generator.py  # Image Logic (Google Gemini)
│   ├── database.py         # Database ORM
│   └── models.py           # Pydantic Validators
├── ui/
│   ├── index.html          # Main Interface
│   ├── js/app.js           # Logic & API Integration
│   └── styles/             # CSS Styling
├── database/               # SQLite Storage
└── requirements.txt        # Dependencies
```

---

## Usage

1.  **Login**: Create your account.
2.  **Input**: Type a prompt OR drag & drop a file (PDF/DOCX).
3.  **Style**: Select a visual style (e.g., *Cinematic, Anime, Noir*).
4.  **Generate**: Watch as the AI breaks your story into scenes.
5.  **Visualize**: **Generated Images"** to bring scenes to life.
6.  **Review**: Scroll through your illustrated storybook.

---

## Technologies

| Component | Tech Stack |
|:---|:---|
| **Backend** | Power-packed **FastAPI** & **Python** |
| **AI Model** | **Google Gemini** (Text & Image Generation) |
| **Orchestration** | **LangChain** for agentic workflows |
| **Database** | **SQLite** (Standard Library) |
| **Frontend** | Pure **HTML5**, **CSS3**, **JavaScript** (No heavy frameworks) |
| **Validation** | **Pydantic** for robust data integrity |

---

## Requirements Met

- [x] **Data Source**: User inputs & Templates
- [x] **Query Types**: Search, Filter, Categorize
- [x] **Agent Memory**: Long-term context retention
- [x] **Summarization**: Auto-generated summaries
- [x] **Classification**: Genre & Style tagging
- [x] **Pattern Detection**: Narrative consistency checks
- [x] **Database**: 7+ Tables (Users, Stories, Scenes, etc.)
- [x] **UI/UX**: Premium, responsive web interface

---

<div align="center">
  <sub>MIT License</sub>
</div>
