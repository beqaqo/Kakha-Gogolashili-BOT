from typing import Optional
import logging

logger = logging.getLogger(__name__)


# ── In-memory store (swap this out for your vector DB later) ─────────────────

class InMemoryStore:
    """
    Temporary article store.
    Replace this class with a VectorStore wrapper (e.g. Chroma, Pinecone, pgvector)
    without touching anything outside this file.
    """

    def __init__(self):
        self._articles: list[dict] = []

    def add(self, articles: list[dict]) -> None:
        self._articles.extend(articles)
        logger.info(f"Store now holds {len(self._articles)} article(s).")

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """
        Naive keyword search — replace with vector similarity search later.
        Scores each article by how many query words appear in title + content.
        """
        query_words = set(query.lower().split())
        scored = []

        for article in self._articles:
            haystack = (article["title"] + " " + article["content"]).lower()
            score = sum(1 for w in query_words if w in haystack)
            if score > 0:
                scored.append((score, article))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [article for _, article in scored[:top_k]]

    def clear(self) -> None:
        self._articles = []

    @property
    def size(self) -> int:
        return len(self._articles)


# Singleton — imported everywhere as `store`
store = InMemoryStore()


# ── Context builder ──────────────────────────────────────────────────────────

def build_context(articles: list[dict], max_chars: int = 3000) -> str:
    """
    Turns retrieved articles into a plain-text context block for the prompt.
    Truncates so we don't blow the context window.
    """
    parts = []
    total = 0

    for a in articles:
        block = (
            f"Title: {a['title']}\n"
            f"Author: {a['author']}\n"
            f"Category: {a['category']}\n"
            f"Tags: {', '.join(a.get('tags', []))}\n"
            f"Content: {a['content']}\n"
        )
        if total + len(block) > max_chars:
            remaining = max_chars - total
            if remaining > 100:
                parts.append(block[:remaining] + "…")
            break
        parts.append(block)
        total += len(block)

    return "\n---\n".join(parts)


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
    """
    Calls the Anthropic Messages API directly (no SDK dependency).
    Set ANTHROPIC_API_KEY in your .env file.
    """
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


# ── Public interface (the only thing api/ should import) ────────────────────

async def get_rag_response(question: str) -> dict:
    """
    Full RAG pipeline:
      1. Retrieve relevant articles from the store
      2. Build a prompt with context
      3. Call the LLM
      4. Return answer + source titles

    Returns:
        { "answer": str, "sources": list[str] }
    """
    retrieved = store.search(question, top_k=5)
    context = build_context(retrieved)
    prompt = build_prompt(question, context)

    logger.info(f"RAG: retrieved {len(retrieved)} article(s) for query: '{question}'")

    answer = await call_llm(prompt)

    sources = [a["title"] for a in retrieved]
    return {"answer": answer, "sources": sources}


async def ingest(articles: list[dict]) -> int:
    """
    Add articles to the store.
    Returns the number of articles added.
    """
    store.add(articles)
    return len(articles)
