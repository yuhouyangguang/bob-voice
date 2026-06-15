from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(64), nullable=False)
    email = db.Column(db.String(128))
    department = db.Column(db.String(128))
    role = db.Column(db.String(16), nullable=False, default="user")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    failed_login_count = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime)
    last_login_at = db.Column(db.DateTime)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "email": self.email,
            "department": self.department,
            "role": self.role,
            "is_active": self.is_active,
        }


class Task(TimestampMixin, db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    source_type = db.Column(db.String(16), nullable=False, default="audio")
    source_file_path = db.Column(db.String(512), nullable=False)
    source_file_name = db.Column(db.String(256), nullable=False)
    source_size = db.Column(db.Integer, nullable=False, default=0)
    audio_duration = db.Column(db.Float)
    status = db.Column(db.String(32), nullable=False, default="pending", index=True)
    progress = db.Column(db.Integer, nullable=False, default=0)
    stage = db.Column(db.String(128), nullable=False, default="等待处理")
    model_size = db.Column(db.String(32), nullable=False, default="fun-asr")
    language = db.Column(db.String(16), nullable=False, default="zh")
    error_msg = db.Column(db.Text)
    retry_count = db.Column(db.Integer, nullable=False, default=0)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    deleted_at = db.Column(db.DateTime, index=True)

    user = db.relationship("User", backref="tasks")
    meeting = db.relationship(
        "Meeting",
        back_populates="task",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_meeting=True):
        data = {
            "id": self.id,
            "source_type": self.source_type,
            "source_file_name": self.source_file_name,
            "source_size": self.source_size,
            "audio_duration": self.audio_duration,
            "status": self.status,
            "progress": self.progress,
            "stage": self.stage,
            "model_size": self.model_size,
            "language": self.language,
            "error_msg": self.error_msg,
            "retry_count": self.retry_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
        }
        if include_meeting and self.meeting:
            data["meeting"] = self.meeting.to_dict()
        return data


class Meeting(TimestampMixin, db.Model):
    __tablename__ = "meetings"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(
        db.Integer,
        db.ForeignKey("tasks.id"),
        unique=True,
        nullable=False,
    )
    meeting_type = db.Column(db.String(32), nullable=False, default="other")
    topic = db.Column(db.String(256), nullable=False)
    meeting_at = db.Column(db.DateTime)
    location = db.Column(db.String(256))
    participants = db.Column(db.JSON, nullable=False, default=list)
    agenda = db.Column(db.Text)
    key_speakers = db.Column(db.JSON, nullable=False, default=list)
    need_supervision_list = db.Column(db.Boolean, nullable=False, default=False)
    generate_word = db.Column(db.Boolean, nullable=False, default=True)
    special_notes = db.Column(db.Text)

    task = db.relationship("Task", back_populates="meeting")
    segments = db.relationship(
        "Segment",
        back_populates="meeting",
        order_by="Segment.seq",
        cascade="all, delete-orphan",
    )
    supervision = db.relationship(
        "SupervisionList",
        back_populates="meeting",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "meeting_type": self.meeting_type,
            "topic": self.topic,
            "meeting_at": (
                self.meeting_at.isoformat() if self.meeting_at else None
            ),
            "location": self.location,
            "participants": self.participants or [],
            "agenda": self.agenda,
            "key_speakers": self.key_speakers or [],
            "need_supervision_list": self.need_supervision_list,
            "generate_word": self.generate_word,
            "special_notes": self.special_notes,
        }


class Speaker(TimestampMixin, db.Model):
    __tablename__ = "speakers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False, index=True)
    title = db.Column(db.String(128))
    type = db.Column(db.String(16), nullable=False, default="leader")
    voice_sample_path = db.Column(db.String(512))
    voice_embedding = db.Column(db.LargeBinary)
    keywords = db.Column(db.JSON, nullable=False, default=list)
    speaking_style = db.Column(db.Text)
    mental_models = db.Column(db.JSON, nullable=False, default=list)
    meeting_count = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    segments = db.relationship("Segment", back_populates="speaker")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "title": self.title,
            "type": self.type,
            "keywords": self.keywords or [],
            "speaking_style": self.speaking_style,
            "mental_models": self.mental_models or [],
            "meeting_count": self.meeting_count,
            "has_voice_sample": bool(self.voice_sample_path),
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Segment(TimestampMixin, db.Model):
    __tablename__ = "segments"
    __table_args__ = (
        db.UniqueConstraint("meeting_id", "seq", name="uq_segment_meeting_seq"),
    )

    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id"),
        nullable=False,
        index=True,
    )
    seq = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.Float, nullable=False, default=0)
    end_time = db.Column(db.Float, nullable=False, default=0)
    raw_text = db.Column(db.Text, nullable=False, default="")
    corrected_text = db.Column(db.Text, nullable=False, default="")
    speaker_label = db.Column(db.String(64), nullable=False, default="未知")
    is_corrected = db.Column(db.Boolean, nullable=False, default=False)
    confidence = db.Column(db.Float)
    manual_edited = db.Column(db.Boolean, nullable=False, default=False)
    speaker_id = db.Column(db.Integer, db.ForeignKey("speakers.id"), index=True)

    meeting = db.relationship("Meeting", back_populates="segments")
    speaker = db.relationship("Speaker", back_populates="segments")

    def to_dict(self):
        return {
            "id": self.id,
            "seq": self.seq,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "raw_text": self.raw_text,
            "text": self.corrected_text or self.raw_text,
            "speaker_label": self.speaker_label,
            "speaker_id": self.speaker_id,
            "is_corrected": self.is_corrected,
            "confidence": self.confidence,
            "manual_edited": self.manual_edited,
        }


class Correction(TimestampMixin, db.Model):
    __tablename__ = "corrections"

    id = db.Column(db.Integer, primary_key=True)
    pattern = db.Column(db.String(256), nullable=False)
    replacement = db.Column(db.String(256), nullable=False)
    category = db.Column(db.String(32), nullable=False, default="通用")
    is_regex = db.Column(db.Boolean, nullable=False, default=False)
    priority = db.Column(db.Integer, nullable=False, default=0)
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))

    def to_dict(self):
        return {
            "id": self.id,
            "pattern": self.pattern,
            "replacement": self.replacement,
            "category": self.category,
            "is_regex": self.is_regex,
            "priority": self.priority,
            "enabled": self.enabled,
        }


class SupervisionList(TimestampMixin, db.Model):
    __tablename__ = "supervision_lists"

    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(
        db.Integer,
        db.ForeignKey("meetings.id"),
        unique=True,
        nullable=False,
    )
    content_md = db.Column(db.Text, nullable=False, default="")
    content_json = db.Column(db.JSON, nullable=False, default=list)
    generated_by = db.Column(db.String(16), nullable=False, default="auto")

    meeting = db.relationship("Meeting", back_populates="supervision")

    def to_dict(self):
        return {
            "id": self.id,
            "content_md": self.content_md,
            "content_json": self.content_json,
            "generated_by": self.generated_by,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Upload(TimestampMixin, db.Model):
    __tablename__ = "uploads"

    id = db.Column(db.String(32), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    file_name = db.Column(db.String(256), nullable=False)
    total_size = db.Column(db.Integer, nullable=False)
    total_chunks = db.Column(db.Integer, nullable=False)
    received_chunks = db.Column(db.JSON, nullable=False, default=list)
    status = db.Column(db.String(16), nullable=False, default="uploading")
    final_path = db.Column(db.String(512))


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    action = db.Column(db.String(64), nullable=False)
    resource_type = db.Column(db.String(32))
    resource_id = db.Column(db.Integer)
    detail = db.Column(db.JSON, nullable=False, default=dict)
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
