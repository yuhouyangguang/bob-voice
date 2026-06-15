from sqlalchemy import func

from ..extensions import db
from ..models import Segment, Speaker

GENERIC_SPEAKER_LABELS = {
    "",
    "未知",
    "汇报人",
    "主持人",
    "其他",
}
GENERIC_SPEAKER_PREFIXES = ("发言人", "speaker ")


def normalize_speaker_name(value):
    return str(value or "").strip()[:64]


def is_named_speaker(value):
    name = normalize_speaker_name(value)
    lowered = name.lower()
    return (
        bool(name)
        and name not in GENERIC_SPEAKER_LABELS
        and not any(lowered.startswith(prefix) for prefix in GENERIC_SPEAKER_PREFIXES)
    )


def meeting_key_speakers(meeting):
    names = []
    for item in meeting.key_speakers or []:
        name = item.get("name") if isinstance(item, dict) else item
        name = normalize_speaker_name(name)
        if is_named_speaker(name) and name not in names:
            names.append(name)
    return names


def get_or_create_speaker(name, speaker_type="leader"):
    name = normalize_speaker_name(name)
    if not is_named_speaker(name):
        return None
    speaker = Speaker.query.filter_by(name=name).first()
    if speaker:
        return speaker
    speaker = Speaker(name=name, type=speaker_type)
    db.session.add(speaker)
    db.session.flush()
    return speaker


def assign_segment_speaker(segment, label=None):
    label = normalize_speaker_name(
        segment.speaker_label if label is None else label
    )
    segment.speaker_label = label or "未知"
    speaker = get_or_create_speaker(label)
    segment.speaker = speaker
    return speaker


def sync_meeting_speakers(meeting):
    for name in meeting_key_speakers(meeting):
        get_or_create_speaker(name)
    for segment in meeting.segments:
        assign_segment_speaker(segment)


def refresh_speaker_meeting_counts():
    counts = dict(
        db.session.query(
            Segment.speaker_id,
            func.count(func.distinct(Segment.meeting_id)),
        )
        .filter(Segment.speaker_id.isnot(None))
        .group_by(Segment.speaker_id)
        .all()
    )
    for speaker in Speaker.query.all():
        speaker.meeting_count = counts.get(speaker.id, 0)


def backfill_speaker_profiles():
    from ..models import Meeting

    for meeting in Meeting.query.all():
        sync_meeting_speakers(meeting)
    refresh_speaker_meeting_counts()
    db.session.commit()
