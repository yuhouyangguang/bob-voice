FROM docker.1ms.run/python:3.13-slim

# ffmpeg for audio duration detection (ffprobe)
# Use Aliyun apt mirror for faster downloads in China
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt

COPY . .

# Persistent data directory
RUN mkdir -p /data/storage

ENV HOST=0.0.0.0 \
    PORT=5000 \
    DATABASE_URL=sqlite:////data/bob_voice.db \
    STORAGE_DIR=/data/storage

EXPOSE 5000

CMD ["python", "run.py"]
