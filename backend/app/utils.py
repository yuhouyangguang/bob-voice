import re
from datetime import datetime
from pathlib import Path

from flask import abort, g, request
from werkzeug.utils import secure_filename

from .extensions import db
from .models import AuditLog, Task


def parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except (TypeError, ValueError):
        raise ValueError("meeting_at 必须是 ISO 8601 日期时间")


def safe_filename(filename):
    original = Path(filename or "upload.bin").name
    suffix = Path(original).suffix.lower()
    stem = secure_filename(Path(original).stem) or "upload"
    return f"{stem}{suffix}"


def slug_filename(value):
    value = re.sub(r'[\\/:*?"<>|]+', "_", value or "未命名会议")
    value = re.sub(r"\s+", "_", value).strip("._")
    return value[:80] or "未命名会议"


def get_owned_task(task_id, include_deleted=False):
    query = Task.query.filter_by(id=task_id, user_id=g.current_user.id)
    if not include_deleted:
        query = query.filter(Task.deleted_at.is_(None))
    task = query.first()
    if not task:
        abort(404, description="任务不存在")
    return task


def audit(action, resource_type=None, resource_id=None, detail=None):
    db.session.add(
        AuditLog(
            user_id=getattr(getattr(g, "current_user", None), "id", None),
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail or {},
            ip_address=request.remote_addr,
        )
    )
