import io
import time
import zipfile

from conftest import auth_headers, login
from app.extensions import socketio


def wait_for_task(client, token, task_id, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(
            f"/api/v1/tasks/{task_id}",
            headers=auth_headers(token),
        )
        task = response.get_json()["task"]
        if task["status"] in {"completed", "failed"}:
            return task
        time.sleep(0.05)
    raise AssertionError("任务未在测试时间内完成")


def test_health_and_auth(client):
    assert client.get("/health").get_json()["status"] == "ok"
    assert client.get("/api/v1/auth/me").status_code == 401
    token = login(client)
    response = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.get_json()["user"]["username"] == "user001"


def test_text_processing_task_and_exports(client):
    admin_token = login(client, "admin", "Admin123!")
    response = client.post(
        "/api/v1/admin/corrections",
        headers=auth_headers(admin_token),
        json={
            "pattern": "封控",
            "replacement": "风控",
            "category": "风控术语",
        },
    )
    assert response.status_code == 201

    token = login(client)
    response = client.post(
        "/api/v1/tasks",
        headers=auth_headers(token),
        data={
            "meeting_meta": (
                '{"source_type":"text","meeting_type":"report",'
                '"topic":"风险专题汇报","key_speakers":["李主任"],'
                '"need_supervision_list":true}'
            ),
            "file": (
                io.BytesIO(
                    "[00:01] 发言人1：我们必须做好封控工作。".encode("utf-8")
                ),
                "sample.txt",
            ),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 202
    task_id = response.get_json()["task"]["id"]
    task = wait_for_task(client, token, task_id)
    assert task["status"] == "completed", task.get("error_msg")

    transcript = client.get(
        f"/api/v1/tasks/{task_id}/transcript",
        headers=auth_headers(token),
    ).get_json()
    assert transcript["segments"][0]["text"] == "我们必须做好风控工作。"
    assert transcript["segments"][0]["speaker_label"] == "李主任"

    markdown = client.get(
        f"/api/v1/tasks/{task_id}/document/markdown",
        headers=auth_headers(token),
    )
    assert "风险专题汇报" in markdown.get_json()["content"]

    word = client.post(
        f"/api/v1/tasks/{task_id}/document/word/generate",
        headers=auth_headers(token),
    )
    assert word.status_code == 200
    assert word.data.startswith(b"PK")

    archive_response = client.get(
        f"/api/v1/tasks/{task_id}/document/zip",
        headers=auth_headers(token),
    )
    with zipfile.ZipFile(io.BytesIO(archive_response.data)) as archive:
        names = archive.namelist()
        assert any(name.endswith(".md") for name in names)
        assert any(name.endswith(".docx") for name in names)
        assert any(name.endswith(".json") for name in names)

    supervision = client.get(
        f"/api/v1/tasks/{task_id}/supervision",
        headers=auth_headers(token),
    )
    assert supervision.status_code == 200
    assert "必须" in supervision.get_json()["supervision"]["content_md"]


def test_chunked_upload(client):
    token = login(client)
    content = b"hello world"
    response = client.post(
        "/api/v1/upload/init",
        headers=auth_headers(token),
        json={
            "file_name": "sample.txt",
            "total_size": len(content),
            "total_chunks": 2,
        },
    )
    upload_id = response.get_json()["upload_id"]

    for index, chunk in enumerate((content[:5], content[5:])):
        response = client.post(
            "/api/v1/upload/chunk",
            headers=auth_headers(token),
            data={
                "upload_id": upload_id,
                "index": str(index),
                "chunk": (io.BytesIO(chunk), f"{index}.part"),
            },
            content_type="multipart/form-data",
        )
        assert response.status_code == 200

    response = client.post(
        "/api/v1/upload/complete",
        headers=auth_headers(token),
        json={"upload_id": upload_id},
    )
    assert response.status_code == 200
    assert response.get_json()["size"] == len(content)


def test_realtime_socket_requires_server_key(app, client):
    token = login(client)
    realtime_client = socketio.test_client(
        app,
        namespace="/realtime",
        headers=auth_headers(token),
    )
    assert realtime_client.is_connected("/realtime")
    realtime_client.emit(
        "realtime:start",
        {"format": "pcm", "sample_rate": 16000},
        namespace="/realtime",
    )
    events = realtime_client.get_received("/realtime")
    assert any(
        event["name"] == "realtime:error"
        and "DASHSCOPE_API_KEY" in event["args"][0]["message"]
        for event in events
    )
    realtime_client.disconnect(namespace="/realtime")
