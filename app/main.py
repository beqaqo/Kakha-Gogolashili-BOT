from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import chat, websocket, ingest

app = FastAPI(
    title="Astronet.ge Chatbot API",
    description="RAG-powered chatbot for the Georgian astronomy website astronet.ge",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(ingest.router)
app.add_api_websocket_route("/ws/chat", websocket.websocket_chat)


@app.get("/health")
async def health():
    from app.services.rag import store
    return {"status": "healthy", "articles_in_store": store.count()}
