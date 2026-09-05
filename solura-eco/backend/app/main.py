"""Solura Eco backend — entrypoint.

Run locally: uvicorn app.main:app --reload
Deployed on Railway the same way (see project README) as cana-ai-tutor.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth,
    brain,
    canvas,
    clients,
    deploy_webhooks,
    documents,
    me,
    members,
    projects,
    tasks,
    telegram_business,
    webhooks,
)

app = FastAPI(title="Solura Eco API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url] if settings.frontend_url else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(brain.router, prefix="/brain", tags=["brain"])
app.include_router(me.router, prefix="/me", tags=["me"])
app.include_router(canvas.router, prefix="/canvas", tags=["canvas"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(clients.router, prefix="/clients", tags=["clients"])
app.include_router(members.router, prefix="/members", tags=["members"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(telegram_business.router, prefix="/webhooks", tags=["telegram"])
app.include_router(deploy_webhooks.router, prefix="/webhooks", tags=["deploy-webhooks"])
app.include_router(documents.router, tags=["documents"])


@app.get("/health")
def health():
    return {"status": "ok"}
