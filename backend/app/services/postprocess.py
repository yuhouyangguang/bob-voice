import re

from docx import Document

from ..models import Correction

TIMESTAMP_PATTERNS = (
    r"\[\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\]",
    r"\(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\)",
    r"^\d{1,2}:\d{2}(?::\d{2})?\s*",
)
SPEAKER_PATTERN = (
    r"^(?:发言人|讲话人|说话人|Speaker)\s*[A-Za-z0-9一二三四五六七八九十]*"
    r"\s*[:：]\s*"
)


def read_text_document(path):
    if path.suffix.lower() == ".txt":
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("无法识别 TXT 文件编码")
    if path.suffix.lower() == ".docx":
        document = Document(path)
        return "\n".join(p.text for p in document.paragraphs if p.text.strip())
    raise ValueError("仅支持 txt 和 docx 文本文件")


def clean_transcript_text(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    for pattern in TIMESTAMP_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.MULTILINE)
    lines = []
    for raw_line in text.splitlines():
        line = re.sub(SPEAKER_PATTERN, "", raw_line.strip(), flags=re.IGNORECASE)
        line = re.sub(r"[\u200b\ufeff]", "", line)
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def split_text_segments(text, max_chars=240):
    parts = re.split(r"(?<=[。！？!?；;])\s*|\n+", text)
    segments = []
    buffer = ""
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if buffer and len(buffer) + len(part) > max_chars:
            segments.append(buffer)
            buffer = part
        else:
            buffer += part
    if buffer:
        segments.append(buffer)
    return segments


def apply_corrections(text, rules=None):
    if rules is None:
        rules = (
            Correction.query.filter_by(enabled=True)
            .order_by(Correction.priority.desc(), Correction.id.asc())
            .all()
        )
    corrected = text
    hits = []
    for rule in rules:
        if rule.is_regex:
            try:
                new_text, count = re.subn(rule.pattern, rule.replacement, corrected)
            except re.error:
                continue
        else:
            count = corrected.count(rule.pattern)
            new_text = corrected.replace(rule.pattern, rule.replacement)
        if count:
            hits.append(
                {
                    "correction_id": rule.id,
                    "pattern": rule.pattern,
                    "replacement": rule.replacement,
                    "count": count,
                }
            )
            corrected = new_text
    return corrected, hits


def extract_supervision_items(text):
    sentences = re.split(r"(?<=[。！？!?；;])", text)
    keywords = ("必须", "不得", "需要", "应当", "要", "请", "抓好", "落实")
    items = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) >= 6 and any(word in sentence for word in keywords):
            items.append(sentence)
    return items[:50]
