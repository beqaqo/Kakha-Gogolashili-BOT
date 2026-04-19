from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Anthropic
    anthropic_api_key: str = "your-api-key-here"
    llm_model: str = "claude-sonnet-4-20250514"
    llm_max_tokens: int = 1024

    # CORS — comma-separated list of allowed origins
    cors_origins: list[str] = ["*"]

    # RAG tuning
    retrieval_top_k: int = 5
    context_max_chars: int = 3000


settings = Settings()
