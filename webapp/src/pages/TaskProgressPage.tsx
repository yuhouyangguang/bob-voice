import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Progress,
  Typography,
  Space,
  Button,
  Tag,
  Descriptions,
  Alert,
  Spin,
  Popconfirm,
  message,
  Timeline,
  Row,
  Col,
} from 'antd';
import {
  ReloadOutlined,
  StopOutlined,
  RedoOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  AudioOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { tasksApi } from '../api/tasks';
import { useTaskSocket } from '../hooks/useTaskSocket';
import { useTaskStore } from '../store/taskStore';
import StatusBadge from '../components/common/StatusBadge';
import type { Task, TaskProgressEvent } from '../types';
import { MEETING_TYPE_LABELS } from '../types';

const { Title, Text } = Typography;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  uploading: <AudioOutlined style={{ color: '#1677ff' }} />,
  transcribing: <AudioOutlined style={{ color: '#C41230' }} />,
  post_processing: <ToolOutlined style={{ color: '#faad14' }} />,
  completed: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
};

const TaskProgressPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const taskId = id ? parseInt(id, 10) : null;
  const navigate = useNavigate();

  const { currentTask, setCurrentTask } = useTaskStore();
  const [loading, setLoading] = useState(true);
  const [stageHistory, setStageHistory] = useState<Array<{ stage: string; time: string; status: string }>>([]);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    try {
      const resp = await tasksApi.get(taskId);
      setCurrentTask(resp.task);
      // Add initial stage to history
      setStageHistory([
        {
          stage: resp.task.stage || '等待开始',
          time: dayjs().format('HH:mm:ss'),
          status: resp.task.status,
        },
      ]);
    } catch (err) {
      console.error('[DEBUG] TaskProgressPage fetchTask error:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId, setCurrentTask]);

  const handleSocketProgress = useCallback(
    (event: TaskProgressEvent) => {
      setStageHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last?.stage === event.stage) return prev;
        return [
          ...prev,
          {
            stage: event.stage || '处理中',
            time: dayjs().format('HH:mm:ss'),
            status: event.status,
          },
        ];
      });

      // When completed, refresh full task data
      if (event.status === 'completed' || event.status === 'failed') {
        fetchTask();
      }
    },
    [fetchTask]
  );

  useTaskSocket({
    taskId,
    onProgress: handleSocketProgress,
    onError: (err) => {
      console.error('[DEBUG] TaskProgressPage socket error:', err);
    },
  });

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const task: Task | null = currentTask?.id === taskId ? currentTask : null;

  const handleCancel = async () => {
    if (!taskId) return;
    try {
      await tasksApi.cancel(taskId);
      message.success('任务已取消');
      fetchTask();
    } catch {
      message.error('取消失败');
    }
  };

  const handleRetry = async () => {
    if (!taskId) return;
    try {
      await tasksApi.retry(taskId);
      message.success('已重新提交');
      fetchTask();
    } catch {
      message.error('重试失败');
    }
  };

  const isProcessing =
    task &&
    ['pending', 'queued', 'uploading', 'processing', 'transcribing', 'post_processing'].includes(
      task.status
    );
  const isCompleted = task?.status === 'completed';
  const isFailed = task?.status === 'failed';

  const getProgressStatus = (): 'normal' | 'active' | 'success' | 'exception' => {
    if (!task) return 'normal';
    if (isCompleted) return 'success';
    if (isFailed) return 'exception';
    if (isProcessing) return 'active';
    return 'normal';
  };

  const getProgressColor = (): string => {
    if (isCompleted) return '#52c41a';
    if (isFailed) return '#ff4d4f';
    return '#C41230';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <div>
        <Alert type="error" message="任务不存在或无权访问" />
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/')}>
          返回列表
        </Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            返回
          </Button>
          <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
            任务 #{task.id}
          </Title>
        </Space>

        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchTask}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            刷新
          </Button>
          {isProcessing && (
            <Popconfirm title="确认取消此任务？" onConfirm={handleCancel} okText="确认" cancelText="取消">
              <Button danger icon={<StopOutlined />}>
                取消任务
              </Button>
            </Popconfirm>
          )}
          {isFailed && (
            <Button
              type="primary"
              icon={<RedoOutlined />}
              onClick={handleRetry}
              style={{ background: '#C41230', borderColor: '#C41230' }}
            >
              重试
            </Button>
          )}
          {isCompleted && (
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              onClick={() => navigate(`/tasks/${task.id}/transcript`)}
              style={{ background: '#C41230', borderColor: '#C41230' }}
            >
              查看转写
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        {/* Main progress card */}
        <Col xs={24} lg={16}>
          <Card
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
            styles={{ body: { padding: 28 } }}
          >
            {/* Status + stage */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <StatusBadge status={task.status} />
              <Title
                level={4}
                style={{
                  color: isFailed ? '#ff4d4f' : isCompleted ? '#52c41a' : '#e8e8f0',
                  marginTop: 12,
                  marginBottom: 4,
                }}
              >
                {task.stage || (isCompleted ? '转写完成' : isFailed ? '转写失败' : '处理中...')}
              </Title>
              {isProcessing && (
                <Text style={{ color: '#6b6b8f', fontSize: 13 }}>请稍候，任务正在处理中...</Text>
              )}
            </div>

            {/* Progress bar */}
            <Progress
              percent={task.progress}
              status={getProgressStatus()}
              strokeColor={getProgressColor()}
              trailColor="#2a2a4a"
              strokeWidth={16}
              style={{ marginBottom: 24 }}
            />

            {/* Error message */}
            {isFailed && task.error_msg && (
              <Alert
                type="error"
                showIcon
                message="处理失败"
                description={task.error_msg}
                style={{ marginBottom: 24 }}
              />
            )}

            {/* Completed actions */}
            {isCompleted && (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="转写已完成！"
                description={
                  <Space style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => navigate(`/tasks/${task.id}/transcript`)}
                      style={{ background: '#C41230', borderColor: '#C41230' }}
                    >
                      查看并编辑转写
                    </Button>
                  </Space>
                }
              />
            )}
          </Card>

          {/* Stage history timeline */}
          <Card
            title={<Text style={{ color: '#e8e8f0' }}>处理进度记录</Text>}
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8, marginTop: 16 }}
            styles={{ body: { padding: 20 } }}
          >
            {stageHistory.length > 0 ? (
              <Timeline
                items={stageHistory.map((item, i) => ({
                  color:
                    item.status === 'completed'
                      ? 'green'
                      : item.status === 'failed'
                      ? 'red'
                      : i === stageHistory.length - 1
                      ? 'red'
                      : 'gray',
                  dot: STAGE_ICONS[item.status] ?? undefined,
                  children: (
                    <div>
                      <Text style={{ color: '#e8e8f0' }}>{item.stage}</Text>
                      <br />
                      <Text style={{ color: '#6b6b8f', fontSize: 12 }}>{item.time}</Text>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Text style={{ color: '#6b6b8f' }}>暂无进度记录</Text>
            )}
          </Card>
        </Col>

        {/* Task info sidebar */}
        <Col xs={24} lg={8}>
          <Card
            title={<Text style={{ color: '#e8e8f0' }}>文件信息</Text>}
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8, marginBottom: 16 }}
            styles={{ body: { padding: 16 } }}
          >
            <Descriptions column={1} size="small" styles={{ label: { color: '#a0a0c0' }, content: { color: '#e8e8f0' } }}>
              <Descriptions.Item label="文件名">
                <Text ellipsis style={{ color: '#e8e8f0', maxWidth: 180 }}>
                  {task.source_file_name}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatFileSize(task.source_size)}</Descriptions.Item>
              <Descriptions.Item label="音频时长">{formatDuration(task.audio_duration)}</Descriptions.Item>
              <Descriptions.Item label="识别模型">
                <Tag color="blue">{task.model_size}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="语言">
                {task.language === 'zh' ? '中文' : task.language === 'en' ? '英文' : '自动'}
              </Descriptions.Item>
              <Descriptions.Item label="重试次数">{task.retry_count}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(task.created_at).format('MM-DD HH:mm')}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {task.meeting && (
            <Card
              title={<Text style={{ color: '#e8e8f0' }}>会议信息</Text>}
              style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
              styles={{ body: { padding: 16 } }}
            >
              <Descriptions
                column={1}
                size="small"
                styles={{ label: { color: '#a0a0c0' }, content: { color: '#e8e8f0' } }}
              >
                <Descriptions.Item label="主题">{task.meeting.topic}</Descriptions.Item>
                <Descriptions.Item label="类型">
                  {MEETING_TYPE_LABELS[task.meeting.meeting_type] ?? task.meeting.meeting_type}
                </Descriptions.Item>
                {task.meeting.location && (
                  <Descriptions.Item label="地点">{task.meeting.location}</Descriptions.Item>
                )}
                {task.meeting.meeting_at && (
                  <Descriptions.Item label="时间">
                    {dayjs(task.meeting.meeting_at).format('YYYY-MM-DD HH:mm')}
                  </Descriptions.Item>
                )}
                {task.meeting.key_speakers?.length > 0 && (
                  <Descriptions.Item label="发言人">
                    <Space wrap size={4}>
                      {task.meeting.key_speakers.map((s) => (
                        <Tag key={s} color="default">
                          {s}
                        </Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="督办清单">
                  {task.meeting.need_supervision_list ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="生成Word">
                  {task.meeting.generate_word ? '是' : '否'}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default TaskProgressPage;
