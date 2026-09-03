"""Login/logout for the 3 Solura Eco members. Generic error messages on
failure -- never reveal whether a username exists.
"""
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.auth.passwords import verify_password
from app.auth.session import create_session_token
from app.config import settings
from app.services.supabase_client import get_client

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest, response: Response):
    db = get_client()
    result = (
        db.table("members")
        .select("id,username,password_hash")
        .eq("username", payload.username)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    member = result.data[0]
    if not member.get("password_hash") or not verify_password(
        payload.password, member["password_hash"]
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_session_token(
        member_id=member["id"], username=member["username"], secret=settings.session_secret
    )

    # Set a cookie too, for anyone hitting the backend directly (e.g. /docs) --
    # the frontend's own cookie is set separately by its /api/login route.
    response.set_cookie(
        "session", token, httponly=True, samesite="lax", max_age=30 * 24 * 3600
    )

    return {"token": token, "username": member["username"]}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}
