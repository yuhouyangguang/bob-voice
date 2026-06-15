// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'user' | 'viewer';
  is_active: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ─── Meeting ─────────────────────────────────────────────────────────────────

export type MeetingType = 'forum' | 'research' | 'report' | 'interview' | 'speech' | 'other';

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  forum: '座谈会',
  research: '调研会',
  report: '汇报会',
  interview: '访谈',
  speech: '大会发言',
  other: '其他',
};

export interface Participant {
  name: string;
  role: string;
}

export interface Meeting {
  id: number;
  meeting_type: MeetingType;
  topic: string;
  meeting_at: string;
  location: string;
  participants: Participant[];
  agenda: string;
  key_speakers: string[];
  need_supervision_list: boolean;
  generate_word: boolean;
}

// ─── Task ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'transcribing'
  | 'post_processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ModelSize = 'fun-asr' | 'whisper-small' | 'whisper-large-v3';
export type Language = 'zh' | 'en' | 'auto';

export interface Task {
  id: number;
  source_type: 'audio' | 'video' | 'upload';
  source_file_name: string;
  source_size: number;
  audio_duration: number | null;
  status: TaskStatus;
  progress: number;
  stage: string;
  model_size: ModelSize;
  language: Language;
  error_msg: string | null;
  retry_count: number;
  created_at: string;
  meeting: Meeting;
}

export interface TaskListResponse {
  items: Task[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
}

// ─── Transcript ──────────────────────────────────────────────────────────────

export interface Segment {
  id: number;
  seq: number;
  start_time: number;
  end_time: number;
  raw_text: string;
  text: string;
  speaker_label: string;
  is_corrected: boolean;
  confidence: number;
  manual_edited: boolean;
}

export type TranscriptFormat = 'timeline' | 'continuous' | 'speaker';

export interface TranscriptResponse {
  format: TranscriptFormat;
  segments?: Segment[];
  text?: string;
  speakers?: Array<{ speaker: string; text: string }>;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadInitResponse {
  upload_id: string;
  chunk_size_recommended: number;
}

export interface UploadChunkResponse {
  upload_id: string;
  received: number;
  total: number;
  progress: number;
}

export interface UploadStatusResponse {
  upload_id: string;
  status: string;
  received_chunks: number;
  total_chunks: number;
  progress: number;
}

export interface UploadCompleteResponse {
  upload_id: string;
  file_name: string;
  size: number;
  status: string;
}

// ─── Meeting Meta (for task creation) ────────────────────────────────────────

export interface MeetingMeta {
  source_type: 'audio' | 'video';
  meeting_type: MeetingType;
  topic: string;
  meeting_at: string;
  location: string;
  participants: Participant[];
  agenda: string;
  key_speakers: string[];
  need_supervision_list: boolean;
  generate_word: boolean;
  special_notes: string;
  model_size: ModelSize;
  language: Language;
}

// ─── Correction ──────────────────────────────────────────────────────────────

export interface Correction {
  id: number;
  pattern: string;
  replacement: string;
  category: string;
  is_regex: boolean;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  department: string | null;
  role: 'admin' | 'advanced' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login: string | null;
  failed_login_count: number;
  locked_until: string | null;
  task_count: number;
}

export interface AdminStats {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  total_users: number;
  total_audio_hours: number;
  corrections_applied: number;
}

// ─── Library ─────────────────────────────────────────────────────────────────

export interface LibraryItem {
  id: number;
  task_id: number;
  meeting_id: number;
  topic: string;
  meeting_type: MeetingType;
  leader: string;
  leaders: string[];
  meeting_at: string | null;
  location: string | null;
  duration: number | null;
  summary: string | null;
  highlighted_summary: string | null;
  matched_segment_count: number;
  matched_segments: Segment[];
  document_urls: Record<string, string>;
}

export interface Leader {
  id: number;
  name: string;
  title: string | null;
  type: 'leader' | 'reporter' | 'unknown';
  keywords: string[];
  speaking_style: string | null;
  mental_models: string[];
  meeting_count: number;
  segment_count: number;
  has_voice_sample: boolean;
}

// ─── Supervision ─────────────────────────────────────────────────────────────

export interface Supervision {
  id: number;
  task_id: number;
  content_md: string;
  content_json: Record<string, unknown>;
  generated_at: string;
  updated_at: string;
}

// ─── Socket ──────────────────────────────────────────────────────────────────

export interface TaskProgressEvent {
  id: number;
  status: TaskStatus;
  progress: number;
  stage: string;
  error_msg: string | null;
  meeting?: Meeting;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  per_page?: number;
  status?: TaskStatus | '';
  q?: string;
}
