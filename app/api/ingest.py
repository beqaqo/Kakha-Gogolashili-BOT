from fastapi import APIRouter, HTTPException
from app.models import Article
from app.services.rag import ingest

router = APIRouter(tags=["ingest"])


@router.post("/ingest")
async def ingest_articles(articles: list[Article]):
    if not articles:
        raise HTTPException(status_code=400, detail="Article list cannot be empty.")

    count = await ingest([a.model_dump() for a in articles])
    return {"status": "ok", "indexed": count}
