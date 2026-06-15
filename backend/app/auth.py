from datetime import datetime, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from .models import User


def issue_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + current_app.config["JWT_EXPIRES"],
    }
    return jwt.encode(
        payload,
        current_app.config["JWT_SECRET_KEY"],
        algorithm="HS256",
    )


def read_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.cookies.get(current_app.config["JWT_COOKIE_NAME"])


def decode_token(token):
    try:
        return jwt.decode(
            token,
            current_app.config["JWT_SECRET_KEY"],
            algorithms=["HS256"],
        )
    except jwt.PyJWTError:
        return None


def current_user_from_request():
    token = read_token()
    payload = decode_token(token) if token else None
    if not payload:
        return None
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
    from .extensions import db

    user = db.session.get(User, user_id)
    return user if user and user.is_active else None


def login_required(func):
    @wraps(func)
    def wrapped(*args, **kwargs):
        user = current_user_from_request()
        if not user:
            return jsonify({"error": "unauthorized", "message": "请先登录"}), 401
        g.current_user = user
        return func(*args, **kwargs)

    return wrapped


def roles_required(*roles):
    def decorator(func):
        @wraps(func)
        @login_required
        def wrapped(*args, **kwargs):
            if g.current_user.role not in roles:
                return jsonify(
                    {"error": "forbidden", "message": "权限不足"}
                ), 403
            return func(*args, **kwargs)

        return wrapped

    return decorator
