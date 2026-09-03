# solura-eco/backend/app/routers/documents.py
"""Documents API -- upload/list/download/delete for the project-scoped
docs library. Not part of projects.py or clients.py: this owns both
project-scoped paths (POST/GET .../documents) and document-scoped paths
(download/delete by document id), which don't fit either existing
router's prefix cleanly -- so it declares full paths and mounts with no
prefix of its own (see main.py).
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth.deps import require_session
from app.services.document_paths import unique_storage_path
from app.services.storage_client import get_storage
from app.services.supabase_client import get_client

router = APIRouter()

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "image/png",
    "image/jpeg",
}
MAX_SIZE_BYTES = 25 * 1024 * 1024
ALLOWED_DOC_TYPES = ("kp", "presentation", "other")


@router.post("/projects/{project_id}/documents")
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    session: dict = Depends(require_session),
):
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of: {', '.join(ALLOWED_DOC_TYPES)}")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, PPTX, DOCX, XLSX, PNG, JPEG",
        )

    body = await file.read()
    if len(body) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Max file size is 25MB")

    db = get_client()
    existing = (
        db.table("documents")
        .select("storage_path")
        .eq("project_id", project_id)
        .execute()
        .data
    )
    existing_paths = {d["storage_path"] for d in existing}
    storage_path = unique_storage_path(project_id, file.filename, existing_paths)

    storage = get_storage()
    storage.upload(storage_path, body, {"content-type": file.content_type})

    try:
        row = {
            "project_id": project_id,
            "doc_type": doc_type,
            "filename": file.filename,
            "storage_path": storage_path,
            "size_bytes": len(body),
            "uploaded_by": session["member_id"],
        }
        result = db.table("documents").insert(row).execute().data[0]
    except Exception:
        # Don't leave an orphaned Storage object if the DB insert fails.
        storage.remove([storage_path])
        raise HTTPException(status_code=500, detail="Failed to save document record")

    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["uploaded_by_name"] = member[0]["full_name"] if member else None
    return result


@router.get("/projects/{project_id}/documents")
async def list_documents(project_id: str, _: dict = Depends(require_session)):
    db = get_client()
    docs = (
        db.table("documents")
        .select("id,doc_type,filename,size_bytes,created_at,members(full_name)")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for d in docs:
        member = d.pop("members", None)
        d["uploaded_by_name"] = member["full_name"] if member else None
    return docs


@router.get("/documents/{document_id}/download")
async def download_document(document_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("documents").select("storage_path").eq("id", document_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_path = result[0]["storage_path"]
    storage = get_storage()
    try:
        signed = storage.create_signed_url(storage_path, 300)
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't generate a download link, try again")

    return {"url": signed["signedURL"]}


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("documents").select("storage_path").eq("id", document_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_path = result[0]["storage_path"]
    storage = get_storage()
    try:
        storage.remove([storage_path])
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't delete the file, try again")

    db.table("documents").delete().eq("id", document_id).execute()
    return {"ok": True}
