"""Solura Assistant, reachable from the web app itself -- the floating
widget (AssistantWidget.tsx), not just Telegram. Same underlying
gather_context/answer_question as the Telegram group-chat path
(telegram_business.py); this just exposes it as a plain authenticated
endpoint instead of behind a webhook trigger.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.ai.assistant import answer_question, gather_context
from app.auth.deps import require_session
from app.services.supabase_client import get_client

router = APIRouter()


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskIn(BaseModel):
    question: str
    history: Optional[list[HistoryMessage]] = None


@router.post("/ask")
async def ask(payload: AskIn, _: dict = Depends(require_session)):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    db = get_client()
    context = gather_context(db)
    history = [m.model_dump() for m in payload.history] if payload.history else None
    answer = answer_question(question, context, history)
    if answer is None:
        raise HTTPException(status_code=503, detail="Couldn't reach the assistant right now")

    return {"answer": answer}
