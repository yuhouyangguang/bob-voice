import html
import re
from collections import OrderedDict
from datetime import date, datetime, time, timedelta

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, or_

from ..auth import login_required
from ..extensions import db
from ..models import Meeting, Segment, Speaker, Task
from ..services.speakers import is_named_speaker

bp = Blueprint("library", __name__, url_prefix="/api/v1/library")
MAX_PAGE_SIZE = 100
MAX_SEARCH_RESULTS = 200


def _multi_values(name):
    values = []
    for raw in request.args.getlist(name):
        for value in raw.split(","):
            value = value.strip()
            if value and value not in values:
                values.append(value)
    return values


def _parse_date(value, field, end=False):
    if not value:
        return None
    try:
        if "T" in value or " " in value:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.replace(tzinfo=None)
        parsed_date = date.fromisoformat(value)
        boundary = datetime.combine(parsed_date, time.min)
        return boundary + timedelta(days=1) if end else boundary
    except (TypeError, ValueError):
        raise ValueError(f"{field} 必须是 ISO 8601 日期")


def _accessible_segments():
    query = (
        Segment.query.join(Meeting)
        .join(Task)
        .filter(Task.deleted_at.is_(None), Task.status == "completed")
    )
    if g.current_user.role != "admin":
        query = query.filter(Task.user_id == g.current_user.id)
    return query


def _speaker_segments(speaker):
    return _accessible_segments().filter(
        or_(
            Segment.speaker_id == speaker.id,
            Segment.speaker_label == speaker.name,
        )
    )


def _keywords():
    return [
        item
        for item in re.split(r"\s+", request.args.get("q", "").strip())
        if item
    ]


def _highlight(text, keywords):
    escaped = html.escape(text)
    for keyword in sorted(keywords, key=len, reverse=True):
        escaped_keyword = html.escape(keyword)
        escaped = re.sub(
            re.escape(escaped_keyword),
            lambda match: f"<mark>{match.group(0)}</mark>",
            escaped,
            flags=re.IGNORECASE,
        )
    return escaped


def _summary(segments, keywords, limit=220):
    text = " ".join(
        (segment.corrected_text or segment.raw_text or "").strip()
        for segment in segments
    ).strip()
    if len(text) > limit:
        text = text[:limit].rstrip() + "..."
    return text, _highlight(text, keywords)


def _archive_item(meeting, segments, keywords):
    task = meeting.task
    named_speakers = []
    for segment in meeting.segments:
        label = segment.speaker_label
        if is_named_speaker(label) and label not in named_speakers:
            named_speakers.append(label)
    summary, highlighted_summary = _summary(segments, keywords)
    return {
        "id": meeting.id,
        "task_id": task.id,
        "meeting_id": meeting.id,
        "topic": meeting.topic,
        "meeting_type": meeting.meeting_type,
        "leader": named_speakers[0] if named_speakers else "",
        "leaders": named_speakers,
        "speaker_label": named_speakers[0] if named_speakers else "",
        "meeting_at": meeting.meeting_at.isoformat() if meeting.meeting_at else None,
        "location": meeting.location,
        "duration": task.audio_duration,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "summary": summary,
        "highlighted_summary": highlighted_summary,
        "matched_keywords": keywords,
        "matched_segment_count": len(segments),
        "segment": segments[0].to_dict() if segments else None,
        "matched_segments": [segment.to_dict() for segment in segments[:10]],
        "document_urls": {
            "transcript": f"/api/v1/tasks/{task.id}/transcript",
            "markdown": f"/api/v1/tasks/{task.id}/document/markdown",
            "word": f"/api/v1/tasks/{task.id}/document/word",
        },
    }


def _group_archives(segments, keywords):
    grouped = OrderedDict()
    for segment in segments:
        grouped.setdefault(segment.meeting_id, []).append(segment)
    return [
        _archive_item(items[0].meeting, items, keywords)
        for items in grouped.values()
    ]


@bp.get("/search")
@login_required
def search():
    try:
        date_from = _parse_date(request.args.get("date_from"), "date_from")
        date_to = _parse_date(request.args.get("date_to"), "date_to", end=True)
    except ValueError as exc:
        return jsonify({"error": "validation_error", "message": str(exc)}), 400
    if date_from and date_to and date_from >= date_to:
        return jsonify(
            {"error": "validation_error", "message": "日期范围无效"}
        ), 400

    query = _accessible_segments()
    keywords = _keywords()
    for keyword in keywords:
        query = query.filter(
            or_(
                Segment.raw_text.contains(keyword),
                Segment.corrected_text.contains(keyword),
                Meeting.topic.contains(keyword),
            )
        )

    leaders = _multi_values("leader")
    if leaders:
        query = query.filter(Segment.speaker_label.in_(leaders))
    meeting_types = _multi_values("type")
    if meeting_types:
        query = query.filter(Meeting.meeting_type.in_(meeting_types))
    if date_from:
        query = query.filter(Meeting.meeting_at >= date_from)
    if date_to:
        query = query.filter(Meeting.meeting_at < date_to)

    segments = query.order_by(
        Meeting.meeting_at.desc(),
        Task.created_at.desc(),
        Segment.seq,
    ).all()
    archives = _group_archives(segments, keywords)
    total = len(archives)
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(
        max(request.args.get("per_page", 20, type=int), 1),
        MAX_PAGE_SIZE,
    )
    start = (page - 1) * per_page
    items = archives[start:start + per_page]
    if start < MAX_SEARCH_RESULTS:
        items = items[: max(MAX_SEARCH_RESULTS - start, 0)]
    else:
        items = []
    return {
        "items": items,
        "total": min(total, MAX_SEARCH_RESULTS),
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": min(total, MAX_SEARCH_RESULTS),
            "pages": (
                (min(total, MAX_SEARCH_RESULTS) + per_page - 1) // per_page
            ),
        },
    }


@bp.get("/leaders")
@login_required
def leaders():
    count_query = (
        db.session.query(
            Segment.speaker_id,
            func.count(Segment.id),
            func.count(func.distinct(Segment.meeting_id)),
        )
        .join(Meeting)
        .join(Task)
        .filter(
            Segment.speaker_id.isnot(None),
            Task.deleted_at.is_(None),
            Task.status == "completed",
        )
    )
    if g.current_user.role != "admin":
        count_query = count_query.filter(Task.user_id == g.current_user.id)
    counts = {
        speaker_id: (segment_count, meeting_count)
        for speaker_id, segment_count, meeting_count in count_query.group_by(
            Segment.speaker_id
        ).all()
    }

    items = []
    for speaker in Speaker.query.filter_by(is_active=True).order_by(Speaker.name):
        item = speaker.to_dict()
        segment_count, meeting_count = counts.get(speaker.id, (0, 0))
        item.update(
            {
                "segment_count": segment_count,
                "meeting_count": meeting_count,
            }
        )
        items.append(item)
    return {
        "leaders": [item["name"] for item in items],
        "items": items,
    }


@bp.get("/leaders/<int:speaker_id>")
@login_required
def leader_detail(speaker_id):
    speaker = Speaker.query.filter_by(id=speaker_id, is_active=True).first_or_404()
    segments = _speaker_segments(speaker).order_by(
        Meeting.meeting_at.desc(),
        Segment.seq,
    ).all()
    archives = _group_archives(segments, [])
    profile = speaker.to_dict()
    profile.update(
        {
            "segment_count": len(segments),
            "meeting_count": len(archives),
            "total_duration": sum(item["duration"] or 0 for item in archives),
            "related_meetings": archives[:10],
        }
    )
    return {"leader": profile}


@bp.get("/leaders/<int:speaker_id>/speeches")
@login_required
def leader_speeches(speaker_id):
    speaker = Speaker.query.filter_by(id=speaker_id, is_active=True).first_or_404()
    segments = _speaker_segments(speaker).order_by(
        Meeting.meeting_at.desc(),
        Segment.seq,
    ).all()
    archives = _group_archives(segments, [])
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(
        max(request.args.get("per_page", 20, type=int), 1),
        MAX_PAGE_SIZE,
    )
    start = (page - 1) * per_page
    items = archives[start:start + per_page]
    for item in items:
        item["content"] = "\n".join(
            segment["text"] for segment in item["matched_segments"]
        )
    return {
        "leader": speaker.to_dict(),
        "items": items,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": len(archives),
            "pages": (len(archives) + per_page - 1) // per_page,
        },
    }
