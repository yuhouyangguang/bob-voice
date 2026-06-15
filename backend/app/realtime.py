from flask import request
from flask_socketio import disconnect, emit, join_room

from .auth import current_user_from_request
from .models import Task


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
