import os
import subprocess
import sys
from pathlib import Path


def test_dotenv_is_loaded_before_config(tmp_path):
    (tmp_path / ".env").write_text(
        "DASHSCOPE_API_KEY=test-dashscope-key\n",
        encoding="utf-8",
    )
    project_root = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env.pop("DASHSCOPE_API_KEY", None)
    env["PYTHONPATH"] = str(project_root)

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.config import Config; print(Config.DASHSCOPE_API_KEY)",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )

    assert result.stdout.strip() == "test-dashscope-key"
