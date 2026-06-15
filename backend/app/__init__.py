import os

from dotenv import load_dotenv
from flask import Flask, jsonify

load_dotenv()

from .config import Config
from .extensions import db, socketio
from .models import User


def create_app(config_object=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object or Config)

    app.config["INSTANCE_DIR"].mkdir(parents=True, exist_ok=True)
    app.config["STORAGE_DIR"].mkdir(parents=True, exist_ok=True)
    for name in ("uploads", "chunks", "documents"):
        (app.config["STORAGE_DIR"] / name).mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    socketio.init_app(
        app,
        cors_allowed_origins=os.getenv("CORS_ORIGINS", "").split(",")
        if os.getenv("CORS_ORIGINS")
        else [],
    )

    from .api.admin import bp as admin_bp
    from .api.auth import bp as auth_bp
    from .api.documents import bp as documents_bp
    from .api.library import bp as library_bp
    from .api.tasks import bp as tasks_bp
    from .api.uploads import bp as uploads_bp
    from .realtime import register_socket_handlers

    app.register_blueprint(auth_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(uploads_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(library_bp)
    app.register_blueprint(admin_bp)
    register_socket_handlers(socketio)

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "bob-voice-backend",
            "asr_provider": app.config["ASR_PROVIDER"],
        }

    @app.errorhandler(400)
    @app.errorhandler(404)
    @app.errorhandler(413)
    def http_error(error):
        message = getattr(error, "description", str(error))
        return jsonify({"error": "http_error", "message": message}), error.code

    with app.app_context():
        db.create_all()
        from .migrations import run_compatibility_migrations
        from .services.speakers import backfill_speaker_profiles

        run_compatibility_migrations()
        backfill_speaker_profiles()
        _bootstrap_admin(app)

    return app


def _bootstrap_admin(app):
    username = os.getenv("BOOTSTRAP_ADMIN_USERNAME")
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
    if not username or not password or User.query.filter_by(username=username).first():
        return
    user = User(
        username=username,
        display_name=os.getenv("BOOTSTRAP_ADMIN_NAME", "系统管理员"),
        role="admin",
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
