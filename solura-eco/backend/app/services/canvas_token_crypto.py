"""Encrypts/decrypts Canvas personal access tokens for storage in
members.canvas_api_token_enc. Python-side Fernet, not Postgres's pgcrypto --
consistent with how every other secret in this app is handled (env var +
application code, not a DB-side crypto function awkward to call through
PostgREST). See docs/superpowers/specs/2026-09-04-canvas-uni-load-design.md.

Key is passed in rather than read from settings here, so this module stays
pure and testable without touching real secrets -- callers pass
`settings.canvas_token_encryption_key.encode()`.
"""
from cryptography.fernet import Fernet


def encrypt_token(plain: str, key: bytes) -> bytes:
    return Fernet(key).encrypt(plain.encode())


def decrypt_token(encrypted: bytes, key: bytes) -> str:
    return Fernet(key).decrypt(encrypted).decode()
