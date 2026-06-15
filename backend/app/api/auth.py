from datetime import timedelta

from flask import Blueprint, current_app, g, jsonify, make_response, request

from ..auth import issue_token, login_required
from ..extensions import db
from ..models import User, utcnow
from ..utils import audit

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    if not username or not password:
        return jsonify(
            {"error": "validation_error", "message": "工号和密码不能为空"}
        ), 400

    user = User.query.filter_by(username=username).first()
    now = utcnow()
    if user and user.locked_until and user.locked_until > now:
        return jsonify(
            {
                "error": "account_locked",
                "message": "登录失败次数过多，请稍后再试",
                "locked_until": user.locked_until.isoformat(),
            }
        ), 423

    if not user or not user.is_active or not user.check_password(password):
        if user:
            user.failed_login_count += 1
            if user.failed_login_count >= 5:
                user.locked_until = now + timedelta(minutes=30)
                user.failed_login_count = 0
            db.session.commit()
        return jsonify(
            {"error": "invalid_credentials", "message": "工号或密码错误"}
        ), 401

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    token = issue_token(user)
    audit("login", "user", user.id)
    db.session.commit()

    response = make_response({"token": token, "user": user.to_dict()})
    response.set_cookie(
        current_app.config["JWT_COOKIE_NAME"],
        token,
        max_age=int(current_app.config["JWT_EXPIRES"].total_seconds()),
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
    )
    return response


@bp.post("/logout")
@login_required
def logout():
    audit("logout", "user", g.current_user.id)
    db.session.commit()
    response = make_response({"message": "已退出登录"})
    response.delete_cookie(current_app.config["JWT_COOKIE_NAME"])
    return response


@bp.get("/me")
@login_required
def me():
    return {"user": g.current_user.to_dict()}


@bp.post("/refresh")
@login_required
def refresh():
    token = issue_token(g.current_user)
    response = make_response({"token": token, "user": g.current_user.to_dict()})
    response.set_cookie(
        current_app.config["JWT_COOKIE_NAME"],
        token,
        max_age=int(current_app.config["JWT_EXPIRES"].total_seconds()),
        httponly=True,
        secure=current_app.config["COOKIE_SECURE"],
        samesite="Lax",
    )
    return response
