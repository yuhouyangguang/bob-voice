import io

from conftest import auth_headers, login
from app.extensions import db
from app.models import User
from test_api import wait_for_task


def create_archive_task(client, token):
    response = client.post(
        "/api/v1/tasks",
        headers=auth_headers(token),
        data={
            "meeting_meta": (
                '{"source_type":"text","meeting_type":"research",'
                '"topic":"科技金融专题调研","meeting_at":"2026-05-20T09:30:00",'
                '"location":"总行会议室","key_speakers":["李主任"]}'
            ),
            "file": (
                io.BytesIO(
                    "李主任提出要加强科技金融风险管理和客户服务。".encode("utf-8")
                ),
                "speech.txt",
            ),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 202
    task_id = response.get_json()["task"]["id"]
    task = wait_for_task(client, token, task_id)
    assert task["status"] == "completed", task.get("error_msg")
    return task_id


def test_library_search_and_leader_profiles(app, client):
    token = login(client)
    task_id = create_archive_task(client, token)

    response = client.get(
        "/api/v1/library/search",
        headers=auth_headers(token),
        query_string={
            "q": "科技金融 风险管理",
            "leader": "李主任",
            "type": "research",
            "date_from": "2026-05-20",
            "date_to": "2026-05-20",
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["total"] == 1
    item = payload["items"][0]
    assert item["task_id"] == task_id
    assert item["leader"] == "李主任"
    assert item["location"] == "总行会议室"
    assert "<mark>科技金融</mark>" in item["highlighted_summary"]
    assert "<mark>风险管理</mark>" in item["highlighted_summary"]

    leaders = client.get(
        "/api/v1/library/leaders",
        headers=auth_headers(token),
    ).get_json()
    assert "李主任" in leaders["leaders"]
    leader = next(item for item in leaders["items"] if item["name"] == "李主任")
    assert leader["meeting_count"] == 1
    assert leader["segment_count"] == 1

    detail = client.get(
        f"/api/v1/library/leaders/{leader['id']}",
        headers=auth_headers(token),
    )
    assert detail.status_code == 200
    detail_data = detail.get_json()["leader"]
    assert detail_data["meeting_count"] == 1
    assert detail_data["related_meetings"][0]["task_id"] == task_id

    speeches = client.get(
        f"/api/v1/library/leaders/{leader['id']}/speeches",
        headers=auth_headers(token),
    ).get_json()
    assert speeches["pagination"]["total"] == 1
    assert "科技金融风险管理" in speeches["items"][0]["content"]

    invalid_date = client.get(
        "/api/v1/library/search?date_from=not-a-date",
        headers=auth_headers(token),
    )
    assert invalid_date.status_code == 400

    with app.app_context():
        other = User(
            username="user002",
            display_name="其他用户",
            role="user",
        )
        other.set_password("Password123!")
        db.session.add(other)
        db.session.commit()
    other_token = login(client, "user002", "Password123!")
    isolated = client.get(
        "/api/v1/library/search?q=科技金融",
        headers=auth_headers(other_token),
    ).get_json()
    assert isolated["total"] == 0


def test_manual_speaker_update_creates_archive_profile(client):
    token = login(client)
    task_id = create_archive_task(client, token)
    transcript = client.get(
        f"/api/v1/tasks/{task_id}/transcript",
        headers=auth_headers(token),
    ).get_json()
    segment_id = transcript["segments"][0]["id"]

    response = client.put(
        f"/api/v1/tasks/{task_id}/segments/{segment_id}/speaker",
        headers=auth_headers(token),
        json={"speaker_label": "王行长"},
    )
    assert response.status_code == 200
    assert response.get_json()["segment"]["speaker_id"] is not None

    leaders = client.get(
        "/api/v1/library/leaders",
        headers=auth_headers(token),
    ).get_json()
    assert "王行长" in leaders["leaders"]
