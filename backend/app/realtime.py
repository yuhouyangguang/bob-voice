import threading

import dashscope
from dashscope.audio.asr import Recognition, RecognitionCallback
from flask import current_app, request
from flask_socketio import disconnect, emit, join_room

from .auth import current_user_from_request
from .models import Task

_sessions = {}
_sessions_lock = threading.Lock()


class BrowserRecognitionCallback(RecognitionCallback):
    def __init__(self, socketio, sid):
        self.socketio = socketio
        self.sid = sid

    def on_open(self):
        self.socketio.emit(
            "realtime:ready",
            {"message": "实时识别连接已建立"},
            to=self.sid,
            namespace="/realtime",
        )

    def on_event(self, result):
        sentence = result.get_sentence() or {}
        text = sentence.get("text", "")
        if not text:
            return
        is_final = bool(
            sentence.get("sentence_end")
            or sentence.get("status") == "SUCCEEDED"
        )
        self.socketio.emit(
            "realtime:result",
            {
                "text": text,
                "is_final": is_final,
                "begin_time": sentence.get("begin_time"),
                "end_time": sentence.get("end_time"),
            },
            to=self.sid,
            namespace="/realtime",
        )

    def on_complete(self):
        self.socketio.emit(
            "realtime:complete",
            {},
            to=self.sid,
            namespace="/realtime",
        )

    def on_error(self, result):
        self.socketio.emit(
            "realtime:error",
            {"message": str(result)},
            to=self.sid,
            namespace="/realtime",
        )

    def on_close(self):
        pass


def register_socket_handlers(socketio):
    @socketio.on("connect", namespace="/tasks")
    def tasks_connect(auth=None):
        if not current_user_from_request():
            return False

    @socketio.on("task:subscribe", namespace="/tasks")
    def task_subscribe(data):
        user = current_user_from_request()
        if not user:
            disconnect()
            return
        task_id = int((data or {}).get("task_id", 0))
        task = Task.query.filter_by(id=task_id, user_id=user.id).first()
        if not task:
            emit("task:error", {"message": "任务不存在"})
            return
        join_room(f"task:{task_id}")
        emit("task:progress", task.to_dict())

    @socketio.on("connect", namespace="/realtime")
    def realtime_connect(auth=None):
        if not current_user_from_request():
            return False

    @socketio.on("realtime:start", namespace="/realtime")
    def realtime_start(data):
        user = current_user_from_request()
        if not user:
            disconnect()
            return
        api_key = current_app.config["DASHSCOPE_API_KEY"]
        if not api_key:
            emit("realtime:error", {"message": "DASHSCOPE_API_KEY 未配置"})
            return
        sid = request.sid
        stop_session(sid)
        dashscope.api_key = api_key
        data = data or {}
        callback = BrowserRecognitionCallback(socketio, sid)
        recognition = Recognition(
            model=current_app.config["REALTIME_ASR_MODEL"],
            format=data.get("format", "pcm"),
            sample_rate=int(data.get("sample_rate", 16000)),
            callback=callback,
        )
        try:
            recognition.start()
        except Exception as exc:
            emit("realtime:error", {"message": str(exc)})
            return
        with _sessions_lock:
            _sessions[sid] = recognition

    @socketio.on("realtime:audio", namespace="/realtime")
    def realtime_audio(audio):
        recognition = _sessions.get(request.sid)
        if not recognition:
            emit("realtime:error", {"message": "请先发送 realtime:start"})
            return
        if not isinstance(audio, (bytes, bytearray)):
            emit("realtime:error", {"message": "音频帧必须是二进制 PCM"})
            return
        try:
            recognition.send_audio_frame(bytes(audio))
        except Exception as exc:
            emit("realtime:error", {"message": str(exc)})

    @socketio.on("realtime:stop", namespace="/realtime")
    def realtime_stop():
        stop_session(request.sid)

    @socketio.on("disconnect", namespace="/realtime")
    def realtime_disconnect():
        stop_session(request.sid)


def stop_session(sid):
    with _sessions_lock:
        recognition = _sessions.pop(sid, None)
    if recognition:
        try:
            recognition.stop()
        except Exception:
            pass
