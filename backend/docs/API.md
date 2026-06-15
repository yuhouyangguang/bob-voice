# BOB Voice Backend API 文档

版本：v1.1  
更新时间：2026-06-05  
默认地址：`http://localhost:5000`

## 1. 通用约定

### 1.1 API 前缀

HTTP API 默认前缀：

```text
/api/v1
```

健康检查不使用该前缀：

```text
GET /health
```

### 1.2 认证方式

除登录和健康检查外，所有接口均需要登录。

支持两种认证方式：

```http
Authorization: Bearer <JWT_TOKEN>
```

或使用登录接口返回的 HttpOnly Cookie：

```text
bob_voice_token=<JWT_TOKEN>
```

JWT 默认有效期为 8 小时。

### 1.3 内容类型

- 普通请求：`application/json`
- 文件和分片上传：`multipart/form-data`
- 文件下载：根据文件格式返回对应 MIME 类型
- 实时转写与任务进度：Socket.IO

### 1.4 时间格式

请求和响应时间使用 ISO 8601：

```text
2026-06-05T14:30:00
```

### 1.5 通用错误格式

```json
{
  "error": "validation_error",
  "message": "会议主题不能为空"
}
```

常见状态码：

| 状态码 | 含义 |
|---|---|
| `200` | 请求成功 |
| `201` | 创建成功 |
| `202` | 已接收，后台处理中 |
| `204` | 操作成功，无响应体 |
| `400` | 参数错误 |
| `401` | 未登录或 Token 无效 |
| `403` | 权限不足 |
| `404` | 资源不存在 |
| `409` | 当前资源状态不允许该操作 |
| `413` | 上传文件过大 |
| `423` | 账号被临时锁定 |

## 2. 数据结构

### 2.1 用户 User

```json
{
  "id": 1,
  "username": "100001",
  "display_name": "张三",
  "email": "zhangsan@example.com",
  "department": "办公室",
  "role": "user",
  "is_active": true
}
```

`role` 可选值：

| 值 | 说明 |
|---|---|
| `user` | 普通用户 |
| `advanced` | 高级用户 |
| `admin` | 管理员 |

### 2.2 会议 Meeting

```json
{
  "id": 1,
  "meeting_type": "forum",
  "topic": "科技金融座谈会",
  "meeting_at": "2026-06-05T14:30:00",
  "location": "总行会议室",
  "participants": [
    {
      "name": "张三",
      "role": "主持人"
    }
  ],
  "agenda": "科技金融工作汇报",
  "key_speakers": ["张三"],
  "need_supervision_list": true,
  "generate_word": true,
  "special_notes": "录音中包含少量环境噪声"
}
```

`meeting_type` 可选值：

| 值 | 说明 |
|---|---|
| `forum` | 座谈会 |
| `research` | 调研会 |
| `report` | 汇报会 |
| `interview` | 访谈 |
| `speech` | 大会发言 |
| `other` | 其他 |

### 2.3 任务 Task

```json
{
  "id": 12,
  "source_type": "audio",
  "source_file_name": "meeting.mp3",
  "source_size": 10485760,
  "audio_duration": 3600.5,
  "status": "transcribing",
  "progress": 25,
  "stage": "正在进行语音识别",
  "model_size": "fun-asr",
  "language": "zh",
  "error_msg": null,
  "retry_count": 0,
  "created_at": "2026-06-05T14:30:00",
  "started_at": "2026-06-05T14:30:01",
  "completed_at": null,
  "meeting": {}
}
```

任务状态：

| 状态 | 说明 |
|---|---|
| `pending` | 等待处理 |
| `preprocessing` | 预处理 |
| `transcribing` | 语音识别中 |
| `postprocessing` | 后处理 |
| `completed` | 已完成 |
| `failed` | 失败 |
| `cancelled` | 已取消 |

### 2.4 转写段落 Segment

```json
{
  "id": 101,
  "seq": 1,
  "start_time": 0.0,
  "end_time": 8.32,
  "raw_text": "我们要做好封控工作。",
  "text": "我们要做好风控工作。",
  "speaker_label": "张三",
  "is_corrected": true,
  "confidence": 0.96,
  "manual_edited": false
}
```

时间单位为秒。`text` 是术语纠正后的文本；没有纠正时等于原文。

## 3. 健康检查

### GET `/health`

无需认证。

响应：

```json
{
  "status": "ok",
  "service": "bob-voice-backend",
  "asr_provider": "dashscope"
}
```

## 4. 认证接口

### POST `/api/v1/auth/login`

工号密码登录。连续失败 5 次后锁定 30 分钟。

请求：

```json
{
  "username": "100001",
  "password": "Password123!"
}
```

响应：

```json
{
  "token": "<JWT_TOKEN>",
  "user": {
    "id": 1,
    "username": "100001",
    "display_name": "张三",
    "role": "user",
    "is_active": true
  }
}
```

同时写入 HttpOnly Cookie `bob_voice_token`。

### POST `/api/v1/auth/logout`

退出登录并删除认证 Cookie。

响应：

```json
{
  "message": "已退出登录"
}
```

### GET `/api/v1/auth/me`

获取当前登录用户。

响应：

```json
{
  "user": {}
}
```

### POST `/api/v1/auth/refresh`

刷新 JWT，返回新的 Token 并更新 Cookie。

响应格式与登录接口一致。

## 5. 转写任务

### POST `/api/v1/tasks`

创建音频转写或文本加工任务。任务提交后异步执行。

请求类型：

```text
multipart/form-data
```

表单字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `file` | File | 条件必填 | 直接上传的音频或文本文件 |
| `upload_id` | String | 条件必填 | 已完成的分片上传 ID |
| `meeting_meta` | JSON String | 是 | 任务和会议信息 |

`file` 和 `upload_id` 必须提供一个。

`meeting_meta`：

```json
{
  "source_type": "audio",
  "meeting_type": "forum",
  "topic": "科技金融座谈会",
  "meeting_at": "2026-06-05T14:30:00",
  "location": "总行会议室",
  "participants": [
    {
      "name": "张三",
      "role": "主持人"
    }
  ],
  "agenda": "科技金融工作汇报",
  "key_speakers": ["张三"],
  "need_supervision_list": true,
  "generate_word": true,
  "special_notes": "包含少量方言",
  "model_size": "fun-asr",
  "language": "zh"
}
```

`source_type`：

- `audio`：录音转文字
- `text`：加工 `.txt` 或 `.docx`

支持的音频格式：

```text
m4a, mp3, wav, flac, ogg, webm, aac, wma
```

支持的文本格式：

```text
txt, docx
```

响应状态：`202 Accepted`

```json
{
  "task": {
    "id": 12,
    "status": "pending",
    "progress": 0,
    "stage": "等待处理"
  }
}
```

示例：

```bash
curl -X POST http://localhost:5000/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@meeting.mp3" \
  -F 'meeting_meta={"source_type":"audio","meeting_type":"forum","topic":"科技金融座谈会","language":"zh"}'
```

### GET `/api/v1/tasks`

获取当前用户的任务列表。

查询参数：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `page` | `1` | 页码 |
| `per_page` | `20` | 每页数量，最大 100 |
| `status` | 无 | 状态筛选；`processing` 代表所有进行中状态 |
| `q` | 无 | 按会议主题模糊搜索 |

响应：

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 0,
    "pages": 0
  }
}
```

### GET `/api/v1/tasks/{task_id}`

获取任务详情。

响应：

```json
{
  "task": {}
}
```

### DELETE `/api/v1/tasks/{task_id}`

软删除任务。

响应状态：`204 No Content`

### POST `/api/v1/tasks/{task_id}/cancel`

取消任务。仅 `pending` 和 `preprocessing` 状态允许取消。

响应：

```json
{
  "task": {
    "id": 12,
    "status": "cancelled",
    "stage": "已取消"
  }
}
```

### POST `/api/v1/tasks/{task_id}/retry`

重试任务。仅 `failed` 和 `cancelled` 状态允许重试。

响应状态：`202 Accepted`

## 6. 转写结果

### GET `/api/v1/tasks/{task_id}/transcript`

查询参数 `format` 支持：

| 值 | 说明 |
|---|---|
| `timeline` | 时间轴模式，默认 |
| `continuous` | 连续文本 |
| `speaker` | 按说话人分组 |

时间轴响应：

```json
{
  "task_id": 12,
  "format": "timeline",
  "segments": [],
  "statistics": {
    "segment_count": 20,
    "character_count": 2500,
    "duration": 600.5
  }
}
```

连续文本响应：

```json
{
  "task_id": 12,
  "format": "continuous",
  "text": "第一段文字\n第二段文字"
}
```

按说话人响应：

```json
{
  "task_id": 12,
  "format": "speaker",
  "speakers": {
    "张三": [],
    "汇报人": []
  }
}
```

### PUT `/api/v1/tasks/{task_id}/segments/{segment_id}`

编辑段落文本。保存时会重新执行术语纠正。

请求：

```json
{
  "text": "修正后的段落文字"
}
```

响应：

```json
{
  "segment": {},
  "corrections": [
    {
      "correction_id": 1,
      "pattern": "封控",
      "replacement": "风控",
      "count": 1
    }
  ]
}
```

### PUT `/api/v1/tasks/{task_id}/segments/{segment_id}/speaker`

修改单个段落的说话人。

请求：

```json
{
  "speaker_label": "张三"
}
```

### PUT `/api/v1/tasks/{task_id}/segments/batch`

批量修改说话人。

请求：

```json
{
  "segment_ids": [101, 102, 103],
  "speaker_label": "汇报人"
}
```

响应：

```json
{
  "updated": 3
}
```

### GET `/api/v1/tasks/{task_id}/corrections`

获取该任务中发生过术语纠正的段落。

响应：

```json
{
  "items": [
    {
      "segment_id": 101,
      "raw_text": "做好封控工作",
      "corrected_text": "做好风控工作"
    }
  ]
}
```

## 7. 分片上传

推荐分片大小：`5 MB`。

### POST `/api/v1/upload/init`

初始化分片上传。

请求：

```json
{
  "file_name": "meeting.mp3",
  "total_size": 104857600,
  "total_chunks": 20
}
```

响应状态：`201 Created`

```json
{
  "upload_id": "6fd7d25c8c894efc9ad25e703b118b7f",
  "chunk_size_recommended": 5242880
}
```

### POST `/api/v1/upload/chunk`

上传单个分片。

请求类型：

```text
multipart/form-data
```

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `upload_id` | String | 上传 ID |
| `index` | Integer | 分片序号，从 0 开始 |
| `chunk` | File | 分片二进制数据 |

响应：

```json
{
  "upload_id": "6fd7d25c8c894efc9ad25e703b118b7f",
  "received": 5,
  "total": 20,
  "progress": 25.0
}
```

### GET `/api/v1/upload/status/{upload_id}`

查询上传状态，可用于断点续传。

响应：

```json
{
  "upload_id": "6fd7d25c8c894efc9ad25e703b118b7f",
  "status": "uploading",
  "received_chunks": [0, 1, 2, 4],
  "total_chunks": 20,
  "progress": 20.0
}
```

### POST `/api/v1/upload/complete`

合并全部分片。

请求：

```json
{
  "upload_id": "6fd7d25c8c894efc9ad25e703b118b7f"
}
```

响应：

```json
{
  "upload_id": "6fd7d25c8c894efc9ad25e703b118b7f",
  "file_name": "meeting.mp3",
  "size": 104857600,
  "status": "completed"
}
```

完成后，创建任务时在 `meeting_meta` 中传入：

```json
{
  "upload_id": "6fd7d25c8c894efc9ad25e703b118b7f",
  "source_type": "audio",
  "meeting_type": "forum",
  "topic": "科技金融座谈会"
}
```

## 8. 文档导出

以下接口要求任务状态为 `completed`。

### GET `/api/v1/tasks/{task_id}/document/markdown`

返回 Markdown 内容：

```json
{
  "content": "# 会议发言整理\n..."
}
```

增加 `?download=1` 后直接下载 `.md` 文件。

### POST `/api/v1/tasks/{task_id}/document/word/generate`

生成并下载公文格式 `.docx`。

### GET `/api/v1/tasks/{task_id}/document/word`

生成并下载 `.docx`，行为与上一个接口相同。

### GET `/api/v1/tasks/{task_id}/document/zip`

下载 ZIP，包含：

- Markdown 文档
- Word 文档
- 完整 JSON

### GET `/api/v1/tasks/{task_id}/document/json`

下载完整结构化 JSON。

## 9. 督办清单

### POST `/api/v1/tasks/{task_id}/supervision/generate`

从转写文本中提取包含“必须、不得、需要、应当、要、请、抓好、落实”等表达的工作要求。

响应：

```json
{
  "supervision": {
    "id": 1,
    "content_md": "一、会议调研督查督办工作落实清单\n...",
    "content_json": [
      "各部门要按期完成相关工作。"
    ],
    "generated_by": "auto",
    "updated_at": "2026-06-05T15:00:00"
  }
}
```

### GET `/api/v1/tasks/{task_id}/supervision`

获取督办清单。

### PUT `/api/v1/tasks/{task_id}/supervision`

人工编辑督办清单。

请求：

```json
{
  "content_md": "编辑后的 Markdown",
  "content_json": [
    "编辑后的清单项目"
  ]
}
```

保存后 `generated_by` 为 `manual`。

## 10. 资料库

### GET `/api/v1/library/search`

搜索已完成任务中的历史发言档案。普通用户只能检索自己的任务，
管理员可检索全部任务。

查询参数：

| 参数 | 说明 |
|---|---|
| `q` | 会议主题或全文关键词；空格分词，多个词按 AND 匹配 |
| `leader` | 领导姓名；支持重复参数或逗号分隔多选 |
| `type` | 会议类型；支持重复参数或逗号分隔多选 |
| `date_from` | 开始日期，ISO 8601 |
| `date_to` | 结束日期，ISO 8601；纯日期包含当天全天 |
| `page` | 页码，默认 1 |
| `per_page` | 每页数量，默认 20，最大 100 |

最多返回 200 条会议档案。结果按会议聚合，并返回关键词摘要和高亮文本。

响应：

```json
{
  "items": [
    {
      "id": 8,
      "task_id": 12,
      "meeting_id": 8,
      "topic": "科技金融座谈会",
      "meeting_at": "2026-06-05T14:30:00",
      "meeting_type": "forum",
      "leader": "张三",
      "leaders": ["张三"],
      "location": "总行会议室",
      "duration": 1800.5,
      "summary": "围绕科技金融风险管理...",
      "highlighted_summary": "围绕<mark>科技金融</mark>风险管理...",
      "matched_segment_count": 2,
      "matched_segments": [],
      "document_urls": {}
    }
  ],
  "total": 1,
  "pagination": {}
}
```

### GET `/api/v1/library/leaders`

返回已注册领导档案及当前用户可访问的发言统计。响应同时提供
`leaders` 姓名数组，以兼容下拉选择器。

响应：

```json
{
  "leaders": ["张三"],
  "items": [
    {
      "id": 1,
      "name": "张三",
      "title": "副行长",
      "type": "leader",
      "keywords": [],
      "speaking_style": null,
      "mental_models": [],
      "meeting_count": 8,
      "segment_count": 42,
      "has_voice_sample": false
    }
  ]
}
```

### GET `/api/v1/library/leaders/{speaker_id}`

返回领导档案、累计会议数、发言段落数、总会议时长和最近关联会议。

### GET `/api/v1/library/leaders/{speaker_id}/speeches`

分页返回指定领导的历史发言，查询参数为 `page` 和 `per_page`。每条记录
包含会议元数据、完整发言内容、段落列表以及原文和文档下载接口地址。

## 11. 管理员接口

以下接口仅允许 `admin` 角色访问。

### 11.1 术语纠错

规则分类固定为：

```text
产品名、机构名、风控术语、领导表达DNA、通用
```

规则按优先级执行；未显式填写优先级时，默认使用 `pattern` 的字符长度，
保证长词优先匹配。规则创建、更新、删除或导入成功后，对后续文本加工任务立即生效。

### GET `/api/v1/admin/corrections`

查询术语纠正规则。

查询参数：

| 参数 | 说明 |
|---|---|
| `q` | 搜索错误模式或正确术语 |
| `category` | 按分类筛选 |
| `enabled` | `true` 或 `false` |
| `sort_by` | `priority`、`pattern`、`category`、`created_at`、`updated_at` |
| `order` | `asc` 或 `desc`，默认 `desc` |
| `page` | 页码，默认 `1` |
| `per_page` | 每页数量，默认 `20`，最大 `100` |

响应：

```json
{
  "items": [
    {
      "id": 1,
      "pattern": "封控",
      "replacement": "风控",
      "category": "风控术语",
      "is_regex": false,
      "priority": 2,
      "enabled": true,
      "created_at": "2026-06-05T14:30:00",
      "updated_at": "2026-06-05T14:30:00"
    }
  ],
  "corrections": [
    {
      "id": 1,
      "pattern": "封控",
      "replacement": "风控",
      "category": "风控术语",
      "is_regex": false,
      "priority": 2,
      "enabled": true,
      "created_at": "2026-06-05T14:30:00",
      "updated_at": "2026-06-05T14:30:00"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 1,
    "pages": 1
  }
}
```

`items` 和 `corrections` 内容相同，`corrections` 用于兼容现有管理端。

### POST `/api/v1/admin/corrections`

新增纠正规则。

请求：

```json
{
  "pattern": "封控",
  "replacement": "风控",
  "category": "风控术语",
  "is_regex": false,
  "priority": 2,
  "enabled": true
}
```

`priority` 未填写时默认为 `pattern` 的字符长度。
相同 `pattern + is_regex` 不允许重复。正则规则会在保存前验证表达式。

### PUT `/api/v1/admin/corrections/{correction_id}`

更新纠正规则。可更新字段：

```text
pattern, replacement, category, is_regex, priority, enabled
```

### DELETE `/api/v1/admin/corrections/{correction_id}`

删除纠正规则。

响应状态：`204 No Content`

### POST `/api/v1/admin/corrections/import`

批量导入 CSV 或 XLSX 文件。请求类型为 `multipart/form-data`，文件字段名为
`file`，文件最大 5MB，最多 5000 行。导入过程使用事务，任一行校验失败时整批回滚。

支持以下英文或中文表头：

| 英文 | 中文别名 | 必填 |
|---|---|---|
| `pattern` | 错误模式、错误词 | 是 |
| `replacement` | 正确术语、替换词 | 是 |
| `category` | 分类 | 否 |
| `is_regex` | 是否正则 | 否 |
| `priority` | 优先级 | 否 |
| `enabled` | 启用 | 否 |

已有相同 `pattern + is_regex` 的规则会被更新，否则创建新规则。

响应：

```json
{
  "created": 8,
  "updated": 2,
  "total": 10
}
```

### GET `/api/v1/admin/corrections/export`

将规则导出为 XLSX 文件。支持与列表接口相同的 `q`、`category`、`enabled`、
`sort_by` 和 `order` 参数。

### 11.2 用户管理

### GET `/api/v1/admin/users`

分页查询用户。

查询参数：

| 参数 | 说明 |
|---|---|
| `q` | 搜索工号、姓名、邮箱或部门 |
| `role` | `user`、`advanced` 或 `admin` |
| `active` | `true` 或 `false` |
| `page` | 页码，默认 `1` |
| `per_page` | 每页数量，默认 `20`，最大 `100` |

响应用户字段包括 `id`、`username`、`display_name`、`email`、`department`、
`role`、`is_active`、`last_login`、`failed_login_count`、`locked_until`、
`task_count`、`created_at` 和 `updated_at`，不会返回密码哈希。

响应同时包含用户统计：

```json
{
  "items": [],
  "users": [],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 0,
    "pages": 0
  },
  "stats": {
    "total": 20,
    "active": 18,
    "inactive": 2,
    "locked": 1
  }
}
```

### POST `/api/v1/admin/users`

创建本地用户。

```json
{
  "username": "zhangsan",
  "password": "Password123!",
  "display_name": "张三",
  "email": "zhangsan@example.com",
  "department": "风险管理部",
  "role": "advanced",
  "is_active": true
}
```

工号仅支持 3-64 位字母、数字、点、下划线和连字符。密码至少 8 位，且必须包含
大小写字母、数字和特殊字符。

### PUT `/api/v1/admin/users/{user_id}`

更新姓名、邮箱、部门、角色或启用状态。请求示例：

```json
{
  "display_name": "张三",
  "department": "内控合规部",
  "role": "user",
  "is_active": false
}
```

系统禁止当前登录管理员停用或降级自己，并始终保留至少一个启用的管理员。
重新启用用户时会同时清除登录失败次数和锁定状态。

### POST `/api/v1/admin/users/{user_id}/reset-password`

重置本地用户密码，并清除登录失败次数和锁定状态。

```json
{
  "password": "NewPassword123!"
}
```

### POST `/api/v1/admin/users/{user_id}/unlock`

清除用户的登录失败次数和临时锁定状态。

### 11.3 系统统计

### GET `/api/v1/admin/stats`

获取基础统计。

响应：

```json
{
  "total_tasks": 100,
  "completed_tasks": 90,
  "failed_tasks": 5,
  "total_audio_duration": 36000.5,
  "active_users": 20
}
```

`total_audio_duration` 单位为秒。

## 12. Socket.IO 任务进度

Namespace：

```text
/tasks
```

连接时需要携带 JWT Cookie 或 Authorization 请求头。

### 客户端事件 `task:subscribe`

```json
{
  "task_id": 12
}
```

### 服务端事件 `task:progress`

订阅成功后立即推送一次，任务状态变化时继续推送。

```json
{
  "id": 12,
  "status": "transcribing",
  "progress": 25,
  "stage": "正在进行语音识别",
  "error_msg": null,
  "meeting": {}
}
```

### 服务端事件 `task:error`

```json
{
  "message": "任务不存在"
}
```

## 13. Socket.IO 实时转写

Namespace：

```text
/realtime
```

实时音频要求：

| 参数 | 要求 |
|---|---|
| 编码 | PCM 16-bit little-endian |
| 采样率 | 默认 16000 Hz |
| 声道 | 单声道 |
| 推荐帧长 | 100ms |
| 100ms 数据大小 | 3200 bytes |

### 客户端事件 `realtime:start`

```json
{
  "format": "pcm",
  "sample_rate": 16000
}
```

### 客户端事件 `realtime:audio`

数据类型必须为二进制，不是 JSON：

```text
ArrayBuffer / Uint8Array / Blob
```

### 客户端事件 `realtime:stop`

无请求参数。发送后服务端结束当前识别会话。

### 服务端事件 `realtime:ready`

```json
{
  "message": "实时识别连接已建立"
}
```

### 服务端事件 `realtime:result`

```json
{
  "text": "北京银行将持续推进科技金融建设",
  "is_final": false,
  "begin_time": 0,
  "end_time": 2250
}
```

`is_final=false` 表示中间结果，前端应覆盖当前临时文本；`is_final=true` 表示句子已确认，前端应追加到最终文本。

DashScope 返回的 `begin_time` 和 `end_time` 通常以毫秒为单位。

### 服务端事件 `realtime:complete`

```json
{}
```

### 服务端事件 `realtime:error`

```json
{
  "message": "DASHSCOPE_API_KEY 未配置"
}
```

## 14. 前端调用示例

### 14.1 HTTP 请求

```javascript
const response = await fetch("/api/v1/tasks?page=1&per_page=20", {
  credentials: "include",
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.message);
}

const data = await response.json();
```

### 14.2 Socket.IO 任务进度

```javascript
import { io } from "socket.io-client";

const taskSocket = io("/tasks", {
  withCredentials: true,
});

taskSocket.on("connect", () => {
  taskSocket.emit("task:subscribe", { task_id: 12 });
});

taskSocket.on("task:progress", (task) => {
  console.log(task.status, task.progress, task.stage);
});
```

### 14.3 Socket.IO 实时转写

```javascript
const realtimeSocket = io("/realtime", {
  withCredentials: true,
});

realtimeSocket.emit("realtime:start", {
  format: "pcm",
  sample_rate: 16000,
});

realtimeSocket.emit("realtime:audio", pcmArrayBuffer);

realtimeSocket.on("realtime:result", (result) => {
  if (result.is_final) {
    console.log("最终结果", result.text);
  } else {
    console.log("中间结果", result.text);
  }
});

realtimeSocket.emit("realtime:stop");
```

## 15. 当前版本限制

- 实时转写结果目前不会自动保存为任务，需由前端保存或后续增加会话落库接口。
- 任务队列使用进程内线程池，服务重启后未完成任务不会自动恢复。
- 当前没有 LDAP、企业微信 OAuth2.0 和声纹注册接口。
- 说话人自动识别尚未实现，当前支持默认重点发言人和人工修正。
- SQLite 版本适用于单机和低并发部署。
