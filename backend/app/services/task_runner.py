import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import current_app

from ..extensions import db, socketio
from ..models import Segment, SupervisionList, Task, utcnow
from .asr import transcribe_file
from .postprocess import (
    apply_corrections,
    clean_transcript_text,
    extract_supervision_items,
    read_text_document,
    split_text_segments,
)
from .speakers import refresh_speaker_meeting_counts, sync_meeting_speakers


def submit_task(app, task_id):
    executor = app.extensions.get("bob_voice_executor")
    if executor is None:
        executor = ThreadPoolExecutor(
            max_workers=app.config["TASK_WORKERS"],
            thread_name_prefix="bob-voice-task",
        )
        app.extensions["bob_voice_executor"] = executor
    return executor.submit(_run_task, app, task_id)


def _emit(task):
    socketio.emit(
        "task:progress",
        task.to_dict(),
        room=f"task:{task.id}",
        namespace="/tasks",
    )


def _set_progress(task, status, progress, stage):
    task.status = status
    task.progress = progress
    task.stage = stage
    db.session.commit()
    _emit(task)


def _run_task(app, task_id):
    with app.app_context():
        task = db.session.get(Task, task_id)
        if not task or task.status == "cancelled":
            return
        try:
            task.started_at = utcnow()
            _set_progress(task, "preprocessing", 10, "正在预处理文件")
            source = Path(task.source_file_path)

            if task.source_type == "text":
                raw_text = read_text_document(source)
                cleaned = clean_transcript_text(raw_text)
                source_segments = [
                    {
                        "start_time": 0,
                        "end_time": 0,
                        "text": text,
                        "confidence": None,
                    }
                    for text in split_text_segments(cleaned)
                ]
                if _cancelled(task):
                    return
                _set_progress(task, "postprocessing", 65, "正在整理文本")
            else:
                task.audio_duration = probe_duration(source)
                if _cancelled(task):
                    return
                _set_progress(task, "transcribing", 25, "正在进行语音识别")
                source_segments = transcribe_file(source, task.language)
                _set_progress(task, "postprocessing", 75, "正在进行术语校对")

            if not source_segments:
                raise ValueError("未提取到可处理的文本内容")

            Segment.query.filter_by(meeting_id=task.meeting.id).delete()
            all_text = []
            for index, source_segment in enumerate(source_segments, start=1):
                raw_text = source_segment["text"].strip()
                corrected, hits = apply_corrections(raw_text)
                all_text.append(corrected)
                db.session.add(
                    Segment(
                        meeting_id=task.meeting.id,
                        seq=index,
                        start_time=source_segment.get("start_time", 0),
                        end_time=source_segment.get("end_time", 0),
                        raw_text=raw_text,
                        corrected_text=corrected,
                        is_corrected=bool(hits),
                        confidence=source_segment.get("confidence"),
                        speaker_label=_default_speaker(task, index),
                    )
                )

            db.session.flush()
            sync_meeting_speakers(task.meeting)
            refresh_speaker_meeting_counts()

            if task.meeting.need_supervision_list:
                _save_supervision(task, "\n".join(all_text))

            task.status = "completed"
            task.progress = 100
            task.stage = "处理完成"
            task.error_msg = None
            task.completed_at = utcnow()
            db.session.commit()
            _emit(task)
        except Exception as exc:
            db.session.rollback()
            task = db.session.get(Task, task_id)
            if task and task.status != "cancelled":
                task.status = "failed"
                task.stage = "处理失败"
                task.error_msg = str(exc)[:2000]
                task.completed_at = utcnow()
                db.session.commit()
                _emit(task)


def _cancelled(task):
    db.session.refresh(task)
    if task.status != "cancelled":
        return False
    _emit(task)
    return True


def _default_speaker(task, index):
    speakers = task.meeting.key_speakers or []
    if len(speakers) == 1:
        speaker = speakers[0]
        return speaker.get("name", "未知") if isinstance(speaker, dict) else str(speaker)
    return "未知"


def _save_supervision(task, text):
    items = extract_supervision_items(text)
    content = "一、会议调研督查督办工作落实清单\n"
    content += "\n".join(f"  {index}. {item}" for index, item in enumerate(items, 1))
    record = task.meeting.supervision or SupervisionList(
        meeting_id=task.meeting.id
    )
    record.content_md = content
    record.content_json = items
    db.session.add(record)


def probe_duration(path):
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        )
        return round(float(result.stdout.strip()), 3)
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        return None
