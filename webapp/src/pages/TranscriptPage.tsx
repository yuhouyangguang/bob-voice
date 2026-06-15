import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Input,
  Tooltip,
  message,
  Spin,
  Tabs,
  Tag,
  Popover,
  Modal,
  Select,
  Divider,
  Row,
  Col,
  Badge,
} from 'antd';
import {
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  ArrowLeftOutlined,
  DownloadOutlined,
  FileWordOutlined,
  FileMarkdownOutlined,
  FileZipOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  UserOutlined,
  ReloadOutlined,
  SaveOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { transcriptApi } from '../api/transcript';
import { documentApi } from '../api/document';
import { tasksApi } from '../api/tasks';
import type { Segment, TranscriptFormat, Task } from '../types';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Format seconds as HH:MM:SS or MM:SS
const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 10);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
};

// Color palette for speakers
const SPEAKER_COLORS = [
  '#C41230', '#1677ff', '#52c41a', '#faad14', '#722ed1',
  '#eb2f96', '#13c2c2', '#fa541c', '#a0d911', '#2f54eb',
];

const getSpeakerColor = (speaker: string, speakers: string[]): string => {
  const idx = speakers.indexOf(speaker);
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length] ?? '#a0a0c0';
};

// ─── Segment Edit Row ─────────────────────────────────────────────────────────

interface SegmentRowProps {
  segment: Segment;
  speakers: string[];
  editMode: boolean;
  onTextSave: (segId: number, text: string) => Promise<void>;
  onSpeakerChange: (segId: number, speaker: string) => Promise<void>;
}

const SegmentRow: React.FC<SegmentRowProps> = ({
  segment,
  speakers,
  editMode,
  onTextSave,
  onSpeakerChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);
  const [saving, setSaving] = useState(false);
  const [speakerPopover, setSpeakerPopover] = useState(false);
  const [newSpeaker, setNewSpeaker] = useState(segment.speaker_label);
  const handleEditStart = () => {
    if (!editMode) return;
    setEditText(segment.text);
    setEditing(true);
  };

  const handleSave = async () => {
    if (editText.trim() === segment.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onTextSave(segment.id, editText.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditText(segment.text);
    setEditing(false);
  };

  const handleSpeakerSave = async () => {
    if (newSpeaker === segment.speaker_label) {
      setSpeakerPopover(false);
      return;
    }
    try {
      await onSpeakerChange(segment.id, newSpeaker);
      setSpeakerPopover(false);
    } catch {
      // error handled in parent
    }
  };

  const speakerColor = getSpeakerColor(segment.speaker_label, speakers);

  const speakerPopoverContent = (
    <div style={{ width: 220 }}>
      <Select
        value={newSpeaker}
        onChange={setNewSpeaker}
        style={{ width: '100%', marginBottom: 8 }}
        options={[
          ...speakers.map((s) => ({ value: s, label: s })),
          { value: '__new__', label: '+ 新增说话人', disabled: true },
        ]}
        dropdownRender={(menu) => (
          <>
            {menu}
            <Divider style={{ margin: '4px 0', borderColor: '#2e2e50' }} />
            <div style={{ padding: '4px 8px' }}>
              <Input
                placeholder="输入新说话人名称"
                size="small"
                onChange={(e) => setNewSpeaker(e.target.value)}
                onPressEnter={handleSpeakerSave}
              />
            </div>
          </>
        )}
      />
      <Space>
        <Button size="small" type="primary" onClick={handleSpeakerSave}
          style={{ background: '#C41230', borderColor: '#C41230' }}>
          确认
        </Button>
        <Button size="small" onClick={() => setSpeakerPopover(false)}>取消</Button>
      </Space>
    </div>
  );

  return (
    <div
      className={`segment-row ${editing ? 'editing' : ''}`}
      style={{
        padding: '10px 14px',
        borderRadius: 6,
        transition: 'background 0.2s',
        background: editing ? '#2a2a4a' : 'transparent',
        border: editing ? '1px solid #C41230' : '1px solid transparent',
        marginBottom: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Timestamp */}
        <Text
          style={{
            color: '#4a4a6a',
            fontSize: 11,
            fontFamily: 'monospace',
            flexShrink: 0,
            minWidth: 80,
            paddingTop: 2,
          }}
        >
          [{formatTime(segment.start_time)}]
        </Text>

        {/* Speaker label */}
        <Popover
          content={speakerPopoverContent}
          title="更改说话人"
          trigger={editMode ? 'click' : []}
          open={speakerPopover}
          onOpenChange={setSpeakerPopover}
        >
          <Tag
            color={speakerColor}
            style={{
              flexShrink: 0,
              cursor: editMode ? 'pointer' : 'default',
              minWidth: 60,
              textAlign: 'center',
              fontSize: 12,
            }}
          >
            {segment.speaker_label || '未知'}
          </Tag>
        </Popover>

        {/* Text content */}
        <div style={{ flex: 1 }}>
          {editing ? (
            <TextArea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoSize={{ minRows: 1, maxRows: 6 }}
              style={{ background: '#252545', borderColor: '#C41230', color: '#e8e8f0' }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleCancel();
                if (e.key === 'Enter' && e.ctrlKey) handleSave();
              }}
            />
          ) : (
            <Text
              style={{
                color: segment.manual_edited ? '#faad14' : '#e8e8f0',
                lineHeight: 1.8,
                cursor: editMode ? 'text' : 'default',
              }}
              onClick={handleEditStart}
            >
              {segment.text}
              {segment.is_corrected && (
                <Tooltip title={`原文: ${segment.raw_text}`}>
                  <Badge
                    dot
                    color="#1677ff"
                    style={{ marginLeft: 4, verticalAlign: 'middle' }}
                  />
                </Tooltip>
              )}
              {segment.manual_edited && (
                <Tooltip title="已手动编辑">
                  <Badge dot color="#faad14" style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                </Tooltip>
              )}
            </Text>
          )}
        </div>

        {/* Edit actions */}
        <div style={{ flexShrink: 0, minWidth: 60 }}>
          {editing ? (
            <Space size={4}>
              <Tooltip title="保存 (Ctrl+Enter)">
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  size="small"
                  loading={saving}
                  onClick={handleSave}
                  style={{ background: '#C41230', borderColor: '#C41230' }}
                />
              </Tooltip>
              <Tooltip title="取消 (Esc)">
                <Button
                  icon={<CloseOutlined />}
                  size="small"
                  onClick={handleCancel}
                  style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                />
              </Tooltip>
            </Space>
          ) : editMode ? (
            <Tooltip title="编辑文字">
              <Button
                type="text"
                icon={<EditOutlined />}
                size="small"
                onClick={handleEditStart}
                style={{ color: '#6b6b8f', opacity: 0 }}
                className="segment-edit-btn"
              />
            </Tooltip>
          ) : null}
        </div>

        {/* Confidence */}
        {segment.confidence > 0 && (
          <Tooltip title={`置信度: ${Math.round(segment.confidence * 100)}%`}>
            <Text style={{ color: '#4a4a6a', fontSize: 11, flexShrink: 0 }}>
              {Math.round(segment.confidence * 100)}%
            </Text>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

// ─── Main Transcript Page ─────────────────────────────────────────────────────

const TranscriptPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const taskId = id ? parseInt(id, 10) : null;
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [viewMode, setViewMode] = useState<TranscriptFormat>('timeline');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [supervisionModal, setSupervisionModal] = useState(false);
  const [supervisionContent, setSupervisionContent] = useState('');
  const [supervisionLoading, setSupervisionLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null);
  const [continuousText, setContinuousText] = useState('');
  const [speakerGroups, setSpeakerGroups] = useState<Array<{ speaker: string; text: string }>>([]);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    try {
      const resp = await tasksApi.get(taskId);
      setTask(resp.task);
    } catch (err) {
      console.error('[DEBUG] TranscriptPage fetchTask error:', err);
    }
  }, [taskId]);

  const fetchTranscript = useCallback(
    async (format: TranscriptFormat) => {
      if (!taskId) return;
      setLoading(true);
      try {
        const resp = await transcriptApi.get(taskId, format);

        if (format === 'timeline' && resp.segments) {
          setSegments(resp.segments);
          // Extract unique speakers
          const uniqueSpeakers = Array.from(
            new Set(resp.segments.map((s) => s.speaker_label).filter(Boolean))
          );
          setSpeakers(uniqueSpeakers);
        } else if (format === 'continuous' && resp.text) {
          setContinuousText(resp.text);
        } else if (format === 'speaker' && resp.speakers) {
          setSpeakerGroups(resp.speakers);
        }
      } catch (err) {
        console.error('[DEBUG] TranscriptPage fetchTranscript error:', err);
        message.error('加载转写内容失败');
      } finally {
        setLoading(false);
      }
    },
    [taskId]
  );

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    fetchTranscript(viewMode);
  }, [fetchTranscript, viewMode]);

  const handleTextSave = useCallback(
    async (segId: number, text: string) => {
      if (!taskId) return;
      try {
        const resp = await transcriptApi.updateSegment(taskId, segId, text);
        setSegments((prev) =>
          prev.map((s) => (s.id === segId ? resp.segment : s))
        );
        message.success('保存成功');
      } catch {
        message.error('保存失败，请重试');
        throw new Error('save failed');
      }
    },
    [taskId]
  );

  const handleSpeakerChange = useCallback(
    async (segId: number, speakerLabel: string) => {
      if (!taskId) return;
      try {
        const resp = await transcriptApi.updateSpeaker(taskId, segId, speakerLabel);
        setSegments((prev) =>
          prev.map((s) => (s.id === segId ? resp.segment : s))
        );
        // Update speaker list if new speaker
        setSpeakers((prev) =>
          prev.includes(speakerLabel) ? prev : [...prev, speakerLabel]
        );
        message.success('说话人已更新');
      } catch {
        message.error('更新失败');
      }
    },
    [taskId]
  );

  const handleDownload = async (type: 'markdown' | 'word' | 'zip' | 'json') => {
    if (!taskId || !task) return;
    const baseName = task.meeting?.topic ?? `task_${taskId}`;
    setDownloadLoading(type);
    try {
      switch (type) {
        case 'markdown':
          await documentApi.downloadMarkdown(taskId, `${baseName}.md`);
          break;
        case 'word':
          await documentApi.generateWord(taskId);
          await documentApi.downloadWord(taskId, `${baseName}.docx`);
          break;
        case 'zip':
          await documentApi.downloadZip(taskId, `${baseName}.zip`);
          break;
        case 'json':
          await documentApi.downloadJson(taskId, `${baseName}.json`);
          break;
      }
      message.success('下载已开始');
    } catch {
      message.error('下载失败，请重试');
    } finally {
      setDownloadLoading(null);
    }
  };

  const handleGenerateSupervision = async () => {
    if (!taskId) return;
    setSupervisionLoading(true);
    try {
      await documentApi.generateSupervision(taskId);
      const resp = await documentApi.getSupervision(taskId);
      setSupervisionContent(resp.supervision.content_md);
      setSupervisionModal(true);
    } catch {
      message.error('生成督办清单失败');
    } finally {
      setSupervisionLoading(false);
    }
  };

  const handleSaveSupervision = async () => {
    if (!taskId) return;
    try {
      await documentApi.updateSupervision(taskId, supervisionContent, {});
      message.success('督办清单已保存');
      setSupervisionModal(false);
    } catch {
      message.error('保存失败');
    }
  };

  const renderTimelineView = () => (
    <div>
      {segments.length === 0 ? (
        <Text style={{ color: '#6b6b8f' }}>暂无转写内容</Text>
      ) : (
        segments.map((seg) => (
          <SegmentRow
            key={seg.id}
            segment={seg}
            speakers={speakers}
            editMode={editMode}
            onTextSave={handleTextSave}
            onSpeakerChange={handleSpeakerChange}
          />
        ))
      )}
    </div>
  );

  const renderContinuousView = () => (
    <div
      style={{
        background: '#252545',
        borderRadius: 8,
        padding: 24,
        lineHeight: 2,
        color: '#e8e8f0',
        fontSize: 15,
        whiteSpace: 'pre-wrap',
        minHeight: 200,
      }}
    >
      {continuousText || <Text style={{ color: '#6b6b8f' }}>暂无转写内容</Text>}
    </div>
  );

  const renderSpeakerView = () => (
    <div>
      {speakerGroups.length === 0 ? (
        <Text style={{ color: '#6b6b8f' }}>暂无转写内容</Text>
      ) : (
        speakerGroups.map((group, i) => (
          <div
            key={i}
            style={{
              marginBottom: 20,
              padding: 16,
              background: '#252545',
              borderRadius: 8,
              borderLeft: `3px solid ${SPEAKER_COLORS[i % SPEAKER_COLORS.length]}`,
            }}
          >
            <Tag
              color={SPEAKER_COLORS[i % SPEAKER_COLORS.length]}
              style={{ marginBottom: 10, fontWeight: 600 }}
            >
              <UserOutlined /> {group.speaker}
            </Tag>
            <Paragraph style={{ color: '#e8e8f0', margin: 0, lineHeight: 1.9 }}>
              {group.text}
            </Paragraph>
          </div>
        ))
      )}
    </div>
  );

  const viewTabs = [
    {
      key: 'timeline',
      label: (
        <span>
          <OrderedListOutlined /> 时间轴
        </span>
      ),
    },
    {
      key: 'continuous',
      label: (
        <span>
          <FileTextOutlined /> 连续文本
        </span>
      ),
    },
    {
      key: 'speaker',
      label: (
        <span>
          <UserOutlined /> 按说话人
        </span>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            返回
          </Button>
          <div>
            <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
              {task?.meeting?.topic ?? '转写内容'}
            </Title>
            {task?.meeting && (
              <Text style={{ color: '#6b6b8f', fontSize: 12 }}>
                {dayjs(task.meeting.meeting_at).format('YYYY-MM-DD')}
                {task.meeting.location ? ` · ${task.meeting.location}` : ''}
              </Text>
            )}
          </div>
        </Space>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchTranscript(viewMode)}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            刷新
          </Button>
          <Button
            type={editMode ? 'primary' : 'default'}
            icon={editMode ? <SaveOutlined /> : <EditOutlined />}
            onClick={() => setEditMode(!editMode)}
            style={
              editMode
                ? { background: '#C41230', borderColor: '#C41230' }
                : { background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }
            }
          >
            {editMode ? '退出编辑' : '编辑模式'}
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {/* Speaker legend (only in timeline mode) */}
        {viewMode === 'timeline' && speakers.length > 0 && (
          <Col xs={24}>
            <Card
              style={{
                background: '#1e1e36',
                border: '1px solid #2e2e50',
                borderRadius: 8,
                padding: 0,
              }}
              styles={{ body: { padding: '10px 16px' } }}
            >
              <Space wrap size={8} align="center">
                <Text style={{ color: '#6b6b8f', fontSize: 13 }}>说话人：</Text>
                {speakers.map((s, i) => (
                  <Tag key={s} color={SPEAKER_COLORS[i % SPEAKER_COLORS.length]}>
                    {s}
                  </Tag>
                ))}
                <Text style={{ color: '#4a4a6a', fontSize: 12 }}>
                  共 {segments.length} 段 · {task?.audio_duration
                    ? `时长 ${Math.floor(task.audio_duration / 60)} 分钟`
                    : ''}
                </Text>
              </Space>
            </Card>
          </Col>
        )}

        {/* Main transcript area */}
        <Col xs={24}>
          <Card
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
            styles={{ body: { padding: 0 } }}
          >
            {/* View mode tabs */}
            <div style={{ borderBottom: '1px solid #2e2e50', padding: '0 16px' }}>
              <Tabs
                activeKey={viewMode}
                onChange={(key) => setViewMode(key as TranscriptFormat)}
                items={viewTabs}
                size="small"
                tabBarStyle={{ marginBottom: 0 }}
              />
            </div>

            {/* Content */}
            <div style={{ padding: 20, minHeight: 400 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                  <Spin size="large" />
                </div>
              ) : (
                <>
                  {viewMode === 'timeline' && renderTimelineView()}
                  {viewMode === 'continuous' && renderContinuousView()}
                  {viewMode === 'speaker' && renderSpeakerView()}
                </>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Bottom toolbar */}
      <Card
        style={{
          background: '#1e1e36',
          border: '1px solid #2e2e50',
          borderRadius: 8,
          marginTop: 16,
          position: 'sticky',
          bottom: 16,
          zIndex: 10,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
        }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: '#6b6b8f', fontSize: 13 }}>
            {editMode ? (
              <span style={{ color: '#faad14' }}>
                <EditOutlined /> 编辑模式
              </span>
            ) : (
              <span>
                <BulbOutlined /> 点击"编辑"修改文字
              </span>
            )}
          </Text>
          <Space wrap size={6}>
              {/* Format cleanup button */}
              <Tooltip title="规范格式整理（自动应用术语纠错）">
                <Button
                  icon={<BulbOutlined />}
                  style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                  onClick={() => message.info('格式整理功能即将推出')}
                >
                  规范整理
                </Button>
              </Tooltip>

              {/* Download transcript */}
              <Tooltip title="下载Markdown转写">
                <Button
                  icon={<FileMarkdownOutlined />}
                  loading={downloadLoading === 'markdown'}
                  onClick={() => handleDownload('markdown')}
                  style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                >
                  下载MD
                </Button>
              </Tooltip>

              <Tooltip title="下载Word文档">
                <Button
                  icon={<FileWordOutlined />}
                  loading={downloadLoading === 'word'}
                  onClick={() => handleDownload('word')}
                  style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                >
                  下载Word
                </Button>
              </Tooltip>

              <Tooltip title="下载ZIP（所有格式）">
                <Button
                  icon={<FileZipOutlined />}
                  loading={downloadLoading === 'zip'}
                  onClick={() => handleDownload('zip')}
                  style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                >
                  下载ZIP
                </Button>
              </Tooltip>

              {/* Supervision list */}
              {task?.meeting?.need_supervision_list && (
                <Button
                  icon={<OrderedListOutlined />}
                  loading={supervisionLoading}
                  onClick={handleGenerateSupervision}
                  style={{ background: '#C41230', borderColor: '#C41230', color: '#fff' }}
                >
                  督办清单
                </Button>
              )}
          </Space>
        </div>
      </Card>

      {/* Supervision modal */}
      <Modal
        title={
          <Text style={{ color: '#e8e8f0' }}>
            <OrderedListOutlined style={{ color: '#C41230', marginRight: 8 }} />
            督办清单
          </Text>
        }
        open={supervisionModal}
        onCancel={() => setSupervisionModal(false)}
        width={700}
        footer={[
          <Button key="cancel" onClick={() => setSupervisionModal(false)}>
            关闭
          </Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveSupervision}
            style={{ background: '#C41230', borderColor: '#C41230' }}
          >
            保存
          </Button>,
          <Button
            key="download"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload('markdown')}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            下载
          </Button>,
        ]}
        style={{ background: '#1e1e36' }}
      >
        <TextArea
          value={supervisionContent}
          onChange={(e) => setSupervisionContent(e.target.value)}
          rows={20}
          style={{
            background: '#252545',
            borderColor: '#2e2e50',
            color: '#e8e8f0',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
          placeholder="督办清单内容（Markdown格式）"
        />
      </Modal>

      <style>{`
        .segment-row:hover .segment-edit-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
};

export default TranscriptPage;
