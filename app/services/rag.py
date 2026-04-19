from typing import Any
import logging

from store import ArticleEmbeddingStore, SearchResult, build_context, create_default_store

logger = logging.getLogger(__name__)


# ── Singleton store (ChromaDB-backed) ────────────────────────────────────────
# Initialised once at startup; persists to ./chroma_db on disk.

store: ArticleEmbeddingStore = create_default_store()


# ── Prompt builder ───────────────────────────────────────────────────────────

def build_prompt(question: str, context: str) -> str:
    if context:
        return f"""You are a helpful astronomy assistant for the Georgian website Astronet.ge.
Answer the user's question using ONLY the context articles provided below.
If the answer is not in the context, say so honestly — do not make things up.
Respond in the same language the user used (Georgian or English).

Context articles:
{context}

User question: {question}

Answer:"""
    else:
        return f"""You are a helpful astronomy assistant for the Georgian website Astronet.ge.
No relevant articles were found in the database for this question.
Answer from your general astronomy knowledge, and mention that the site may not have a specific article on this topic.
Respond in the same language the user used (Georgian or English).

User question: {question}

Answer:"""


# ── Anthropic LLM call ───────────────────────────────────────────────────────

async def call_llm(prompt: str) -> str:
    import httpx
    from app.core.config import settings

    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "max_tokens": settings.llm_max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=body,
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]


# ── Public interface ─────────────────────────────────────────────────────────

async def get_rag_response(question: str) -> dict[str, Any]:
    """
    Full RAG pipeline:
      1. Embed question and search ChromaDB for semantically similar articles
      2. Build a grounded prompt from retrieved context
      3. Call the LLM
      4. Return answer + source titles
    """
    results: list[SearchResult] = await store.aquery(question, limit=5)

    context = build_context(results)          # teammate's build_context
    prompt = build_prompt(question, context)

    logger.info(f"RAG: retrieved {len(results)} article(s) for query: '{question}'")

    answer = await call_llm(prompt)

    sources = [r.metadata.get("title", r.id) for r in results]
    return {"answer": answer, "sources": sources}


async def ingest(articles: list[dict]) -> int:
    """
    Upsert articles into ChromaDB (deduplicates by content hash automatically).
    Returns the number of articles indexed.
    """
    count = await store.aupsert_articles(articles)
    logger.info(f"Ingested {count} article(s) into ChromaDB.")
    return count
