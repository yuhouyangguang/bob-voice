import uuid
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request

from ..auth import login_required
from ..extensions import db
from ..models import Upload
from ..utils import safe_filename

bp = Blueprint("uploads", __name__, url_prefix="/api/v1/upload")


@bp.post("/init")
@login_required
def init_upload():
    data = request.get_json(silent=True) or {}
    file_name = safe_filename(data.get("file_name", "upload.bin"))
    total_size = int(data.get("total_size", 0))
    total_chunks = int(data.get("total_chunks", 0))
    if total_size <= 0 or total_chunks <= 0:
        return jsonify(
            {"error": "validation_error", "message": "文件大小和分片数必须大于 0"}
        ), 400
    if total_size > current_app.config["MAX_CONTENT_LENGTH"]:
        return jsonify(
            {"error": "file_too_large", "message": "文件超过服务端大小限制"}
        ), 413
    upload_id = uuid.uuid4().hex
    chunk_dir = current_app.config["STORAGE_DIR"] / "chunks" / upload_id
    chunk_dir.mkdir(parents=True, exist_ok=False)
    upload = Upload(
        id=upload_id,
        user_id=g.current_user.id,
        file_name=file_name,
        total_size=total_size,
        total_chunks=total_chunks,
        received_chunks=[],
    )
    db.session.add(upload)
    db.session.commit()
    return jsonify(
        {
            "upload_id": upload_id,
            "chunk_size_recommended": 5 * 1024 * 1024,
        }
    ), 201


@bp.post("/chunk")
@login_required
def upload_chunk():
    upload_id = request.form.get("upload_id", "")
    index = request.form.get("index", type=int)
    chunk = request.files.get("chunk")
    upload = Upload.query.filter_by(
        id=upload_id,
        user_id=g.current_user.id,
        status="uploading",
    ).first()
    if not upload or chunk is None or index is None:
        return jsonify(
            {"error": "validation_error", "message": "上传参数不完整"}
        ), 400
    if index < 0 or index >= upload.total_chunks:
        return jsonify(
            {"error": "validation_error", "message": "分片序号越界"}
        ), 400
    chunk_path = (
        current_app.config["STORAGE_DIR"]
        / "chunks"
        / upload.id
        / f"{index:08d}.part"
    )
    chunk.save(chunk_path)
    received = set(upload.received_chunks or [])
    received.add(index)
    upload.received_chunks = sorted(received)
    db.session.commit()
    return {
        "upload_id": upload.id,
        "received": len(received),
        "total": upload.total_chunks,
        "progress": round(len(received) / upload.total_chunks * 100, 2),
    }


@bp.post("/complete")
@login_required
def complete_upload():
    data = request.get_json(silent=True) or {}
    upload = Upload.query.filter_by(
        id=data.get("upload_id"),
        user_id=g.current_user.id,
        status="uploading",
    ).first()
    if not upload:
        return jsonify(
            {"error": "not_found", "message": "上传记录不存在"}
        ), 404
    if len(upload.received_chunks or []) != upload.total_chunks:
        return jsonify(
            {"error": "incomplete_upload", "message": "仍有分片未上传"}
        ), 409

    final_name = f"{uuid.uuid4().hex}_{upload.file_name}"
    final_path = current_app.config["STORAGE_DIR"] / "uploads" / final_name
    chunk_dir = current_app.config["STORAGE_DIR"] / "chunks" / upload.id
    with final_path.open("wb") as output:
        for index in range(upload.total_chunks):
            part = chunk_dir / f"{index:08d}.part"
            with part.open("rb") as source:
                while block := source.read(1024 * 1024):
                    output.write(block)
    if final_path.stat().st_size != upload.total_size:
        final_path.unlink(missing_ok=True)
        return jsonify(
            {"error": "size_mismatch", "message": "合并后文件大小不一致"}
        ), 409

    for part in chunk_dir.iterdir():
        part.unlink()
    chunk_dir.rmdir()
    upload.status = "completed"
    upload.final_path = str(final_path)
    db.session.commit()
    return {
        "upload_id": upload.id,
        "file_name": upload.file_name,
        "size": upload.total_size,
        "status": upload.status,
    }


@bp.get("/status/<upload_id>")
@login_required
def upload_status(upload_id):
    upload = Upload.query.filter_by(
        id=upload_id,
        user_id=g.current_user.id,
    ).first_or_404()
    received = len(upload.received_chunks or [])
    return {
        "upload_id": upload.id,
        "status": upload.status,
        "received_chunks": upload.received_chunks or [],
        "total_chunks": upload.total_chunks,
        "progress": round(received / upload.total_chunks * 100, 2),
    }
