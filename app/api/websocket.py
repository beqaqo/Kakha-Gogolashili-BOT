import json
import logging
from fastapi import WebSocket, WebSocketDisconnect
from app.services.rag import get_rag_response

logger = logging.getLogger(__name__)


async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection opened")

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                payload = json.loads(raw)
                question = payload.get("question", "").strip()
                session_id = payload.get("session_id")
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "data": "Invalid JSON payload."})
                continue

            if not question:
                await websocket.send_json({"type": "error", "data": "Question cannot be empty."})
                continue

            logger.info(f"[session={session_id}] Question: {question}")

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
