import io

from flask import Blueprint, jsonify, request, send_file

from ..auth import login_required
from ..services.documents import (
    document_basename,
    render_json,
    render_markdown,
    render_word,
    render_zip,
)
from ..utils import get_owned_task

bp = Blueprint("documents", __name__, url_prefix="/api/v1/tasks")


def _completed_task(task_id):
    task = get_owned_task(task_id)
    if task.status != "completed":
        return None, (
            jsonify(
                {"error": "invalid_state", "message": "任务完成后才能生成文档"}
            ),
            409,
        )
    return task, None


@bp.get("/<int:task_id>/document/markdown")
@login_required
def markdown_document(task_id):
    task, error = _completed_task(task_id)
    if error:
        return error
    content = render_markdown(task)
    if request.args.get("download") == "1":
        return send_file(
            io.BytesIO(content.encode("utf-8")),
            mimetype="text/markdown; charset=utf-8",
            as_attachment=True,
            download_name=document_basename(task) + ".md",
        )
    return {"content": content}


@bp.post("/<int:task_id>/document/word/generate")
@login_required
def generate_word(task_id):
    task, error = _completed_task(task_id)
    if error:
        return error
    return send_file(
        render_word(task),
        mimetype=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
        as_attachment=True,
        download_name=document_basename(task) + ".docx",
    )


@bp.get("/<int:task_id>/document/word")
@login_required
def word_document(task_id):
    return generate_word(task_id)


@bp.get("/<int:task_id>/document/zip")
@login_required
def zip_document(task_id):
    task, error = _completed_task(task_id)
    if error:
        return error
    return send_file(
        render_zip(task),
        mimetype="application/zip",
        as_attachment=True,
        download_name=document_basename(task) + ".zip",
    )


@bp.get("/<int:task_id>/document/json")
@login_required
def json_document(task_id):
    task, error = _completed_task(task_id)
    if error:
        return error
    return send_file(
        io.BytesIO(render_json(task)),
        mimetype="application/json; charset=utf-8",
        as_attachment=True,
        download_name=document_basename(task) + ".json",
    )
