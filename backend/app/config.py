import os
from datetime import timedelta
from pathlib import Path


class Config:
    BASE_DIR = Path(__file__).resolve().parent.parent
    INSTANCE_DIR = BASE_DIR / "instance"

    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{INSTANCE_DIR / 'bob_voice.db'}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"check_same_thread": False}}

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_EXPIRES = timedelta(hours=int(os.getenv("JWT_EXPIRES_HOURS", "8")))
    JWT_COOKIE_NAME = os.getenv("JWT_COOKIE_NAME", "bob_voice_token")
    COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

    STORAGE_DIR = Path(os.getenv("STORAGE_DIR", INSTANCE_DIR / "storage"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_MB", "500")) * 1024 * 1024
    TASK_WORKERS = int(os.getenv("TASK_WORKERS", "2"))

    ASR_PROVIDER = os.getenv("ASR_PROVIDER", "dashscope")
    DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
    DASHSCOPE_API_BASE_URL = os.getenv(
        "DASHSCOPE_API_BASE_URL",
        "https://dashscope.aliyuncs.com/api/v1",
    ).rstrip("/")
    FILE_ASR_MODEL = os.getenv("FILE_ASR_MODEL", "fun-asr")

    ALLOWED_AUDIO_EXTENSIONS = {
        "m4a", "mp3", "wav", "flac", "ogg", "webm", "aac", "wma",
    }
    ALLOWED_TEXT_EXTENSIONS = {"txt", "docx"}


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TASK_WORKERS = 1
    ASR_PROVIDER = "mock"
    SECRET_KEY = "test-secret"
    JWT_SECRET_KEY = "test-jwt-secret"
