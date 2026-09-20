"""
Centralized configuration for AgentAudit.

All settings are loaded from environment variables (or .env file).
"""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings, loaded from environment variables / .env file."""

    # Groq API key for the semantic evaluator (LLM-as-judge)
    groq_api_key: str = ""

    # Database URL — default is a SQLite file in the project root
    database_url: str = "sqlite+aiosqlite:///./agentaudit.db"

    # Groq model ID for semantic evaluation
    semantic_model: str = "openai/gpt-oss-20b"

    # Whether the semantic evaluator is enabled
    enable_semantic: bool = True

    # Log level
    log_level: str = "INFO"

    # Path to the policy YAML file
    policy_file: str = "policies/default_policies.yaml"

    # API server settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # CORS origins for dashboard dev server
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
