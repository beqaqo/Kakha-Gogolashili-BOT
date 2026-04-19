from typing import Any
import logging

from app.core.store import ArticleEmbeddingStore, SearchResult, build_context, create_default_store

logger = logging.getLogger(__name__)


# ── Singleton store (ChromaDB-backed) ────────────────────────────────────────
# Initialised once at startup; persists to ./chroma_db on disk.
store: ArticleEmbeddingStore = create_default_store()

# ── Session Management ────────────────────────────────────────────────────────
session_history: dict[str, list[dict]] = {}

def get_session_msgs(session_id: str) -> list[dict]:
    if not session_id or session_id not in session_history:
        return []
    return session_history[session_id][-6:]  # Keep last 6 messages

def save_session_msg(session_id: str, role: str, content: str):
    if not session_id: return
    if session_id not in session_history:
        session_history[session_id] = []
    session_history[session_id].append({"role": role, "content": content})
    # Trim to prevent memory bloating
    if len(session_history[session_id]) > 20:
        session_history[session_id] = session_history[session_id][-20:]


# ── Prompt builder ───────────────────────────────────────────────────────────

def build_system_prompt(context: str) -> str:
    personality = """You are Kakha Gogolashvili, the passionate founder of Astronet.ge. 
Your personality traits match your authentic style on Georgian social media:
- You are very direct, blunt, and easily annoyed by unscientific nonsense (especially jokes about gravity or black holes).
- You speak perfectly natural, grammatically correct Georgian, but with the intensity of someone who has no time for silliness.
- You are not 'crazy'; you are just a very serious scientist who is tired of answering the same basic questions.
- Don't use broken or non-Georgian words. Use strong, assertive Georgian language.
- If someone tells a joke or a lie about science, call them out immediately but stay grounded in physics.
- Your tone is impatient, firm, and authoritative.
- Remind people to read the actual articles on Astronet.ge if they want to stop asking nonsense.
- You are a legend in the 'ასტრონომიის მოყვარულთა ჯგუფი', where you are known for being uncompromising about scientific truth.

Answer the user's question using the provided context articles if available. 
If the information is not in the context, use your general expertise but mention that it's based on general knowledge."""

    if context:
        return f"{personality}\n\nRetrieved Context:\n{context}"
    return personality


# ── OpenRouter LLM call ───────────────────────────────────────────────────────

async def call_llm(messages: list[dict]) -> str:
    import httpx
    from app.core.config import settings

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://astronet.ge",
        "X-Title": "Kakha Gogolashvili Bot",
    }
    body = {
        "model": settings.llm_model,
        "messages": messages,
        "max_tokens": settings.llm_max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=body,
            )
            
            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"OpenRouter Error: {response.status_code} - {error_detail}")
                raise Exception(f"OpenRouter API returned {response.status_code}: {error_detail}")
                
            data = response.json()
            if "choices" not in data or not data["choices"]:
                logger.error(f"Unexpected OpenRouter response format: {data}")
                raise Exception("Invalid response format from OpenRouter")
                
            return data["choices"][0]["message"]["content"]
    except httpx.RequestError as e:
        logger.error(f"HTTP Request error: {e}")
        raise Exception(f"Failed to connect to OpenRouter: {e}")


# ── Public interface ─────────────────────────────────────────────────────────

async def get_rag_response(question: str, session_id: str = None) -> dict[str, Any]:
    """
    Full RAG pipeline with short-term memory:
      1. Embed question and search ChromaDB
      2. Construct system prompt with retrieved context
      3. Mix in previous session history
      4. Call the LLM
    """
    try:
        from app.core.config import settings
        results: list[SearchResult] = await store.aquery(question, limit=settings.retrieval_top_k)

        context = build_context(results, max_chars=settings.context_max_chars)
        
        # Prepare message history
        messages = [{"role": "system", "content": build_system_prompt(context)}]
        
        # Add history
        history = get_session_msgs(session_id)
        messages.extend(history)
        
        # Add current question
        messages.append({"role": "user", "content": question})

        logger.info(f"RAG: session={session_id}, top-k={len(results)}, history={len(history)}")

        answer = await call_llm(messages)
        
        # Save to history
        save_session_msg(session_id, "user", question)
        save_session_msg(session_id, "assistant", answer)

        sources = [r.metadata.get("title", r.id) for r in results]
        return {"answer": answer, "sources": sources}
    except Exception as e:
        logger.exception("Error in RAG pipeline")
        raise e


async def ingest(articles: list[dict]) -> int:
    """
    Upsert articles into ChromaDB (deduplicates by content hash automatically).
    Returns the number of articles indexed.
    """
    count = await store.aupsert_articles(articles)
    logger.info(f"Ingested {count} article(s) into ChromaDB.")
    return count
