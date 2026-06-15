import json
import uuid
from datetime import datetime
from pathlib import Path

from flask import Blueprint, current_app, g, jsonify, request

from ..auth import login_required
from ..extensions import db
from ..models import Meeting, Segment, SupervisionList, Task, utcnow
from ..services.postprocess import apply_corrections, extract_supervision_items
from ..services.speakers import (
    assign_segment_speaker,
    refresh_speaker_meeting_counts,
)
from ..services.task_runner import submit_task
from ..utils import audit, get_owned_task, parse_datetime, safe_filename

bp = Blueprint("tasks", __name__, url_prefix="/api/v1")
VALID_MEETING_TYPES = {"forum", "research", "report", "interview", "speech", "other"}


def _meeting_payload(data):
    meeting_type = data.get("meeting_type", "other")
    if meeting_type not in VALID_MEETING_TYPES:
        raise ValueError("meeting_type 值无效")
    topic = str(data.get("topic", "")).strip()
    if not topic:
        raise ValueError("会议主题不能为空")
    return {
        "meeting_type": meeting_type,
        "topic": topic,
        "meeting_at": parse_datetime(data.get("meeting_at")),
        "location": data.get("location"),
        "participants": data.get("participants") or [],
        "agenda": data.get("agenda"),
        "key_speakers": data.get("key_speakers") or [],
        "need_supervision_list": bool(data.get("need_supervision_list", False)),
        "generate_word": bool(data.get("generate_word", True)),
        "special_notes": data.get("special_notes"),
    }


@bp.post("/tasks")
@login_required
def create_task():
    if request.is_json:
        data = request.get_json() or {}
    else:
        raw_meta = request.form.get("meeting_meta", "{}")
        try:
            data = json.loads(raw_meta)
        except json.JSONDecodeError:
            return jsonify(
                {"error": "validation_error", "message": "meeting_meta 不是合法 JSON"}
            ), 400

    source_type = data.get("source_type", request.form.get("source_type", "audio"))
    if source_type not in {"audio", "text"}:
        return jsonify(
            {"error": "validation_error", "message": "source_type 仅支持 audio/text"}
        ), 400

    file = request.files.get("file")
    upload_id = data.get("upload_id") or request.form.get("upload_id")
    if file:
        filename = safe_filename(file.filename)
        extension = Path(filename).suffix.lower().lstrip(".")
        allowed = (
            current_app.config["ALLOWED_AUDIO_EXTENSIONS"]
            if source_type == "audio"
            else current_app.config["ALLOWED_TEXT_EXTENSIONS"]
        )
        if extension not in allowed:
            return jsonify(
                {"error": "unsupported_file", "message": f"不支持的文件格式: {extension}"}
            ), 400
        stored_name = f"{uuid.uuid4().hex}_{filename}"
        path = current_app.config["STORAGE_DIR"] / "uploads" / stored_name
        file.save(path)
    elif upload_id:
        from ..models import Upload

        upload = Upload.query.filter_by(
            id=upload_id,
            user_id=g.current_user.id,
            status="completed",
        ).first()
        if not upload or not upload.final_path:
            return jsonify(
                {"error": "validation_error", "message": "上传记录不存在或尚未完成"}
            ), 400
        path = Path(upload.final_path)
        filename = upload.file_name
    else:
        return jsonify(
            {"error": "validation_error", "message": "请上传待处理文件"}
        ), 400

    extension = Path(filename).suffix.lower().lstrip(".")
    allowed = (
        current_app.config["ALLOWED_AUDIO_EXTENSIONS"]
        if source_type == "audio"
        else current_app.config["ALLOWED_TEXT_EXTENSIONS"]
    )
    if extension not in allowed:
        return jsonify(
            {"error": "unsupported_file", "message": f"不支持的文件格式: {extension}"}
        ), 400

    try:
        meeting_data = _meeting_payload(data)
    except ValueError as exc:
        path.unlink(missing_ok=True)
        return jsonify({"error": "validation_error", "message": str(exc)}), 400

    task = Task(
        user_id=g.current_user.id,
        source_type=source_type,
        source_file_path=str(path),
        source_file_name=filename,
        source_size=path.stat().st_size,
        status="pending",
        progress=0,
        stage="等待处理",
        model_size=data.get("model_size", current_app.config["FILE_ASR_MODEL"]),
        language=data.get("language", "zh"),
    )
    task.meeting = Meeting(**meeting_data)
    db.session.add(task)
    db.session.flush()
    audit("task.create", "task", task.id, {"source_type": source_type})
    db.session.commit()
    submit_task(current_app._get_current_object(), task.id)
    return jsonify({"task": task.to_dict()}), 202


@bp.get("/tasks")
@login_required
def list_tasks():
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 20, type=int), 1), 100)
    query = Task.query.filter_by(user_id=g.current_user.id).filter(
        Task.deleted_at.is_(None)
    )
    status = request.args.get("status")
    if status:
        statuses = (
            ["pending", "preprocessing", "transcribing", "postprocessing"]
            if status == "processing"
            else [status]
        )
        query = query.filter(Task.status.in_(statuses))
    search = request.args.get("q", "").strip()
    if search:
        query = query.join(Meeting).filter(Meeting.topic.contains(search))
    pagination = query.order_by(Task.created_at.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False,
    )
    return {
        "items": [task.to_dict() for task in pagination.items],
        "pagination": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
        },
    }


@bp.get("/tasks/<int:task_id>")
@login_required
def task_detail(task_id):
    return {"task": get_owned_task(task_id).to_dict()}


@bp.delete("/tasks/<int:task_id>")
@login_required
def delete_task(task_id):
    task = get_owned_task(task_id)
    task.deleted_at = utcnow()
    audit("task.delete", "task", task.id)
    db.session.commit()
    return "", 204


@bp.post("/tasks/<int:task_id>/cancel")
@login_required
def cancel_task(task_id):
    task = get_owned_task(task_id)
    if task.status not in {"pending", "preprocessing"}:
        return jsonify(
            {"error": "invalid_state", "message": "当前状态不能取消"}
        ), 409
    task.status = "cancelled"
    task.stage = "已取消"
    audit("task.cancel", "task", task.id)
    db.session.commit()
    return {"task": task.to_dict()}


@bp.post("/tasks/<int:task_id>/retry")
@login_required
def retry_task(task_id):
    task = get_owned_task(task_id)
    if task.status not in {"failed", "cancelled"}:
        return jsonify(
            {"error": "invalid_state", "message": "仅失败或已取消任务可以重试"}
        ), 409
    task.status = "pending"
    task.stage = "等待重试"
    task.progress = 0
    task.error_msg = None
    task.retry_count += 1
    db.session.commit()
    submit_task(current_app._get_current_object(), task.id)
    return jsonify({"task": task.to_dict()}), 202


@bp.get("/tasks/<int:task_id>/transcript")
@login_required
def transcript(task_id):
    task = get_owned_task(task_id)
    segments = [segment.to_dict() for segment in task.meeting.segments]
    view_format = request.args.get("format", "timeline")
    if view_format == "speaker":
        groups = {}
        for segment in segments:
            groups.setdefault(segment["speaker_label"], []).append(segment)
        return {"task_id": task.id, "format": "speaker", "speakers": groups}
    if view_format == "continuous":
        return {
            "task_id": task.id,
            "format": "continuous",
            "text": "\n".join(segment["text"] for segment in segments),
        }
    return {
        "task_id": task.id,
        "format": "timeline",
        "segments": segments,
        "statistics": {
            "segment_count": len(segments),
            "character_count": sum(len(item["text"]) for item in segments),
            "duration": task.audio_duration,
        },
    }


@bp.put("/tasks/<int:task_id>/segments/<int:segment_id>")
@login_required
def edit_segment(task_id, segment_id):
    task = get_owned_task(task_id)
    segment = Segment.query.filter_by(
        id=segment_id,
        meeting_id=task.meeting.id,
    ).first_or_404()
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify(
            {"error": "validation_error", "message": "段落文字不能为空"}
        ), 400
    corrected, hits = apply_corrections(text)
    segment.raw_text = text
    segment.corrected_text = corrected
    segment.is_corrected = bool(hits)
    segment.manual_edited = True
    audit("segment.edit", "segment", segment.id)
    db.session.commit()
    return {"segment": segment.to_dict(), "corrections": hits}


@bp.put("/tasks/<int:task_id>/segments/<int:segment_id>/speaker")
@login_required
def edit_speaker(task_id, segment_id):
    task = get_owned_task(task_id)
    segment = Segment.query.filter_by(
        id=segment_id,
        meeting_id=task.meeting.id,
    ).first_or_404()
    speaker = str((request.get_json(silent=True) or {}).get("speaker_label", "")).strip()
    if not speaker:
        return jsonify(
            {"error": "validation_error", "message": "说话人不能为空"}
        ), 400
    segment.speaker_label = speaker[:64]
    assign_segment_speaker(segment)
    segment.manual_edited = True
    refresh_speaker_meeting_counts()
    db.session.commit()
    return {"segment": segment.to_dict()}


@bp.put("/tasks/<int:task_id>/segments/batch")
@login_required
def batch_edit_speaker(task_id):
    task = get_owned_task(task_id)
    data = request.get_json(silent=True) or {}
    segment_ids = data.get("segment_ids") or []
    speaker = str(data.get("speaker_label", "")).strip()
    if not segment_ids or not speaker:
        return jsonify(
            {"error": "validation_error", "message": "segment_ids 和说话人不能为空"}
        ), 400
    segments = Segment.query.filter(
        Segment.meeting_id == task.meeting.id,
        Segment.id.in_(segment_ids),
    ).all()
    for segment in segments:
        segment.speaker_label = speaker[:64]
        assign_segment_speaker(segment)
        segment.manual_edited = True
    updated = len(segments)
    refresh_speaker_meeting_counts()
    db.session.commit()
    return {"updated": updated}


@bp.get("/tasks/<int:task_id>/corrections")
@login_required
def task_corrections(task_id):
    task = get_owned_task(task_id)
    items = []
    for segment in task.meeting.segments:
        if segment.is_corrected:
            items.append(
                {
                    "segment_id": segment.id,
                    "raw_text": segment.raw_text,
                    "corrected_text": segment.corrected_text,
                }
            )
    return {"items": items}


@bp.post("/tasks/<int:task_id>/supervision/generate")
@login_required
def generate_supervision(task_id):
    task = get_owned_task(task_id)
    text = "\n".join(
        segment.corrected_text or segment.raw_text
        for segment in task.meeting.segments
    )
    items = extract_supervision_items(text)
    content = "一、会议调研督查督办工作落实清单\n"
    content += "\n".join(f"  {i}. {item}" for i, item in enumerate(items, 1))
    record = task.meeting.supervision or SupervisionList(
        meeting_id=task.meeting.id
    )
    record.content_md = content
    record.content_json = items
    record.generated_by = "auto"
    db.session.add(record)
    db.session.commit()
    return {"supervision": record.to_dict()}


@bp.get("/tasks/<int:task_id>/supervision")
@login_required
def get_supervision(task_id):
    task = get_owned_task(task_id)
    if not task.meeting.supervision:
        return jsonify(
            {"error": "not_found", "message": "尚未生成督办清单"}
        ), 404
    return {"supervision": task.meeting.supervision.to_dict()}


@bp.put("/tasks/<int:task_id>/supervision")
@login_required
def edit_supervision(task_id):
    task = get_owned_task(task_id)
    record = task.meeting.supervision
    if not record:
        return jsonify(
            {"error": "not_found", "message": "尚未生成督办清单"}
        ), 404
    data = request.get_json(silent=True) or {}
    record.content_md = str(data.get("content_md", record.content_md))
    record.content_json = data.get("content_json", record.content_json)
    record.generated_by = "manual"
    db.session.commit()
    return {"supervision": record.to_dict()}
