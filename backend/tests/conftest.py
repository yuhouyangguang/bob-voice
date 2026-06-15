import io

import pytest

from app import create_app
from app.config import TestingConfig
from app.extensions import db
from app.models import User


@pytest.fixture()
def app(tmp_path):
    class TestConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_path / 'test.db'}"
        STORAGE_DIR = tmp_path / "storage"
        DASHSCOPE_API_KEY = ""

    application = create_app(TestConfig)
    with application.app_context():
        user = User(
            username="user001",
            display_name="测试用户",
            role="user",
        )
        user.set_password("Password123!")
        admin = User(
            username="admin",
            display_name="管理员",
            role="admin",
        )
        admin.set_password("Admin123!")
        db.session.add_all([user, admin])
        db.session.commit()
    yield application
    executor = application.extensions.get("bob_voice_executor")
    if executor:
        executor.shutdown(wait=True)


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, username="user001", password="Password123!"):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.get_json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}
