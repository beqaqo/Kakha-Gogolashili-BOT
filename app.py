from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Astronet.ge Chatbot API",
    description="RAG-powered chatbot API for astronet.ge astronomy website",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ──────────────────────────────────────────────────────────

class Article(BaseModel):
    title: str
    author: str
    category: str
    tags: list[str]
    content: str


class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    session_id: Optional[str] = None
    sources: Optional[list[str]] = None


# ── Stub: replace with your teammate's RAG module ───────────────────────────

async def get_rag_response(question: str, articles: list[dict] | None = None) -> dict:
    """
    Placeholder — swap this body for your RAG teammate's function.

    Expected return shape:
        {
            "answer": "...",
            "sources": ["Article title 1", "Article title 2"]   # optional
        }
    """
    # TODO: import and call the real RAG pipeline here, e.g.:
    # from rag_module import query_rag
    # return await query_rag(question)

    await asyncio.sleep(0.1)  # simulate async work
    return {
        "answer": f"(RAG stub) You asked: '{question}'. Connect the real RAG module here.",
        "sources": [],
    }


# ── REST endpoint ────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, summary="Single-turn chat")
async def chat(request: ChatRequest):
    """
    Accepts a question and returns a RAG-generated answer.

    Use this for simple request/response interactions.
    For streaming (token-by-token), use the WebSocket endpoint instead.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    result = await get_rag_response(request.question)
    return ChatResponse(
        answer=result["answer"],
        session_id=request.session_id,
        sources=result.get("sources", []),
    )


# ── WebSocket endpoint ───────────────────────────────────────────────────────

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """
    WebSocket endpoint for real-time / streaming chat.

    Message protocol
    ────────────────
    Client  → server  (JSON):
        { "question": "...", "session_id": "optional-string" }

    Server  → client  (JSON):
        { "type": "token",  "data": "..." }          # streamed token (optional)
        { "type": "answer", "data": "...", "sources": [...] }  # final answer
        { "type": "error",  "data": "..." }          # on error
    """
    await websocket.accept()
    logger.info("WebSocket connection opened")

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                payload = json.loads(raw)
                question = payload.get("question", "").strip()
                session_id = payload.get("session_id")

                if not question:
                    await websocket.send_json({"type": "error", "data": "Question cannot be empty."})
                    continue

            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "data": "Invalid JSON payload."})
                continue

            logger.info(f"[session={session_id}] Question: {question}")

            # ── Streaming skeleton ──────────────────────────────────────────
            # If your RAG model supports token streaming, yield tokens here:
            #
            #   async for token in rag_stream(question):
            #       await websocket.send_json({"type": "token", "data": token})
            #
            # For now we call the non-streaming stub and send the full answer.
            # ───────────────────────────────────────────────────────────────

            result = await get_rag_response(question)

            await websocket.send_json({
                "type": "answer",
                "data": result["answer"],
                "sources": result.get("sources", []),
                "session_id": session_id,
            })

    except WebSocketDisconnect:
        logger.info("WebSocket connection closed by client")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "data": "Internal server error."})
        except Exception:
            pass


# ── Ingest endpoint (for the scraping teammate) ──────────────────────────────

@app.post("/ingest", summary="Ingest scraped articles into the RAG index")
async def ingest_articles(articles: list[Article]):
    """
    The web-scraping teammate posts articles here.
    Forward them to the RAG module for indexing.

    Article schema:
        title    : str
        author   : str
        category : str
        tags     : list[str]
        content  : str
    """
    if not articles:
        raise HTTPException(status_code=400, detail="Article list cannot be empty.")

    # TODO: pass to RAG indexer, e.g.:
    # from rag_module import index_articles
    # await index_articles([a.model_dump() for a in articles])

    logger.info(f"Received {len(articles)} article(s) for indexing.")
    return {"status": "ok", "indexed": len(articles)}


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "healthy"}