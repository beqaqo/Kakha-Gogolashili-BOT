from fastapi import APIRouter, HTTPException
from app.models.chat import ChatRequest, ChatResponse
from app.services.rag import get_rag_response

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    result = await get_rag_response(request.question)
    return ChatResponse(
        answer=result["answer"],
        session_id=request.session_id,
        sources=result.get("sources", []),
    )
