from sqlalchemy import inspect, text

from .extensions import db


def run_compatibility_migrations():
    inspector = inspect(db.engine)
    segment_columns = {column["name"] for column in inspector.get_columns("segments")}
    if "speaker_id" not in segment_columns:
        db.session.execute(
            text(
                "ALTER TABLE segments "
                "ADD COLUMN speaker_id INTEGER REFERENCES speakers(id)"
            )
        )
        db.session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_segments_speaker_id "
                "ON segments (speaker_id)"
            )
        )
        db.session.commit()
    category_aliases = {
        "finance": "风控术语",
        "person": "领导表达DNA",
        "org": "机构名",
        "product": "产品名",
        "common": "通用",
        "other": "通用",
    }
    for old_value, new_value in category_aliases.items():
        db.session.execute(
            text(
                "UPDATE corrections SET category = :new_value "
                "WHERE category = :old_value"
            ),
            {"old_value": old_value, "new_value": new_value},
        )
    db.session.commit()
