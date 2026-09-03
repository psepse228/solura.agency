"""Solura Eco backend — entrypoint.

Run locally: uvicorn app.main:app --reload
Deployed on Railway the same way (see project README) as cana-ai-tutor.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import canvas, clients, tasks

app = FastAPI(title="Solura Eco API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url] if settings.frontend_url else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(canvas.router, prefix="/canvas", tags=["canvas"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(clients.router, prefix="/clients", tags=["clients"])


@app.get("/health")
def health():
    return {"status": "ok"}
