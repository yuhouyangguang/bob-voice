import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Button,
  Input,
  Select,
  Space,
  Typography,
  Statistic,
  Popconfirm,
  message,
  Tooltip,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  AudioOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  DeleteOutlined,
  StopOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { tasksApi } from '../api/tasks';
import { useTaskStore } from '../store/taskStore';
import StatusBadge from '../components/common/StatusBadge';
import type { Task, TaskStatus } from '../types';

const { Title, Text } = Typography;
const { Search } = Input;

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '等待中' },
  { value: 'queued', label: '排队中' },
  { value: 'transcribing', label: '转写中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    tasks,
    loading,
    totalTasks,
    currentPage,
    pageSize,
    filterStatus,
    filterQuery,
    setTasks,
    setLoading,
    setCurrentPage,
    setFilterStatus,
    setFilterQuery,
  } = useTaskStore();

  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    processing: 0,
    failed: 0,
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await tasksApi.list({
        page: currentPage,
        per_page: pageSize,
        status: filterStatus as TaskStatus | '',
        q: filterQuery || undefined,
      });
      setTasks(resp.items, resp.pagination.total);

      // Compute quick stats from all tasks (use pagination total for rough counts)
      setStats({
        total: resp.pagination.total,
        completed: resp.items.filter((t) => t.status === 'completed').length,
        processing: resp.items.filter(
          (t) => ['processing', 'transcribing', 'post_processing', 'queued'].includes(t.status)
        ).length,
        failed: resp.items.filter((t) => t.status === 'failed').length,
      });
    } catch (err) {
      console.error('[DEBUG] DashboardPage fetchTasks error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, filterStatus, filterQuery, setLoading, setTasks]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleDelete = async (id: number) => {
    try {
      await tasksApi.delete(id);
      message.success('任务已删除');
      fetchTasks();
    } catch {
      message.error('删除失败');
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await tasksApi.cancel(id);
      message.success('任务已取消');
      fetchTasks();
    } catch {
      message.error('取消失败');
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await tasksApi.retry(id);
      message.success('已重新提交');
      fetchTasks();
    } catch {
      message.error('重试失败');
    }
  };

  const columns: ColumnsType<Task> = [
    {
      title: '任务ID',
      dataIndex: 'id',
      width: 80,
      render: (id: number) => (
        <Text style={{ color: '#C41230', fontFamily: 'monospace' }}>#{id}</Text>
      ),
    },
    {
      title: '会议主题',
      key: 'topic',
      ellipsis: true,
      render: (_, record) => (
        <div>
          <Text style={{ color: '#e8e8f0', fontWeight: 500 }}>{record.meeting?.topic ?? '—'}</Text>
          <br />
          <Text style={{ color: '#6b6b8f', fontSize: 12 }}>{record.source_file_name}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: TaskStatus) => <StatusBadge status={status} />,
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 80,
      render: (progress: number, record) => {
        const isActive = ['processing', 'transcribing', 'uploading', 'post_processing'].includes(
          record.status
        );
        return (
          <Tag color={isActive ? 'processing' : 'default'} style={{ minWidth: 50, textAlign: 'center' }}>
            {progress}%
          </Tag>
        );
      },
    },
    {
      title: '时长',
      dataIndex: 'audio_duration',
      width: 90,
      render: (d: number | null) => (
        <Text style={{ color: '#a0a0c0', fontSize: 13 }}>{formatDuration(d)}</Text>
      ),
    },
    {
      title: '文件大小',
      dataIndex: 'source_size',
      width: 100,
      render: (size: number) => (
        <Text style={{ color: '#a0a0c0', fontSize: 13 }}>{formatFileSize(size)}</Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 150,
      render: (dt: string) => (
        <Text style={{ color: '#a0a0c0', fontSize: 12 }}>
          {dayjs(dt).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => {
        const isProcessing = ['processing', 'transcribing', 'uploading', 'post_processing', 'queued', 'pending'].includes(
          record.status
        );
        const canRetry = record.status === 'failed';
        const isCompleted = record.status === 'completed';

        return (
          <Space size={4}>
            <Tooltip title={isProcessing ? '查看进度' : isCompleted ? '查看转写' : '查看详情'}>
              <Button
                type="text"
                icon={<EyeOutlined />}
                size="small"
                style={{ color: '#a0a0c0' }}
                onClick={() => {
                  if (isCompleted) {
                    navigate(`/tasks/${record.id}/transcript`);
                  } else {
                    navigate(`/tasks/${record.id}`);
                  }
                }}
              />
            </Tooltip>
            {isProcessing && (
              <Tooltip title="取消任务">
                <Popconfirm
                  title="确认取消此任务？"
                  onConfirm={() => handleCancel(record.id)}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    icon={<StopOutlined />}
                    size="small"
                    style={{ color: '#faad14' }}
                  />
                </Popconfirm>
              </Tooltip>
            )}
            {canRetry && (
              <Tooltip title="重试">
                <Button
                  type="text"
                  icon={<RedoOutlined />}
                  size="small"
                  style={{ color: '#52c41a' }}
                  onClick={() => handleRetry(record.id)}
                />
              </Tooltip>
            )}
            <Tooltip title="删除">
              <Popconfirm
                title="确认删除此任务？此操作不可撤销。"
                onConfirm={() => handleDelete(record.id)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  size="small"
                  style={{ color: '#ff4d4f' }}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
          控制台
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/record')}
          style={{ background: '#C41230', borderColor: '#C41230' }}
        >
          新建转写
        </Button>
      </div>

      {/* Stats cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Statistic
              title={<Text style={{ color: '#a0a0c0', fontSize: 13 }}>总任务数</Text>}
              value={stats.total}
              prefix={<AudioOutlined style={{ color: '#C41230' }} />}
              valueStyle={{ color: '#e8e8f0', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Statistic
              title={<Text style={{ color: '#a0a0c0', fontSize: 13 }}>已完成</Text>}
              value={stats.completed}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Statistic
              title={<Text style={{ color: '#a0a0c0', fontSize: 13 }}>处理中</Text>}
              value={stats.processing}
              prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff', fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <Statistic
              title={<Text style={{ color: '#a0a0c0', fontSize: 13 }}>失败</Text>}
              value={stats.failed}
              prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Quick actions */}
      <Card
        style={{
          background: '#1e1e36',
          border: '1px solid #2e2e50',
          borderRadius: 8,
          marginBottom: 16,
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Text style={{ color: '#a0a0c0', marginRight: 16 }}>快速操作：</Text>
        <Space wrap>
          <Button
            icon={<AudioOutlined />}
            onClick={() => navigate('/record')}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            上传音频转写
          </Button>
          <Button
            icon={<AudioOutlined />}
            onClick={() => navigate('/record?tab=record')}
            style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
          >
            录音转写
          </Button>
        </Space>
      </Card>

      {/* Tasks table */}
      <Card
        style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
        title={<Text style={{ color: '#e8e8f0' }}>转写任务列表</Text>}
        extra={
          <Space wrap>
            <Search
              placeholder="搜索会议主题或文件名"
              allowClear
              style={{ width: 220, minWidth: 140 }}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onSearch={() => {
                setCurrentPage(1);
                fetchTasks();
              }}
            />
            <Select
              value={filterStatus}
              onChange={(val) => {
                setFilterStatus(val as TaskStatus | '');
                setCurrentPage(1);
              }}
              options={STATUS_OPTIONS}
              style={{ width: 120 }}
            />
            <Tooltip title="刷新">
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchTasks}
                style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
              />
            </Tooltip>
          </Space>
        }
      >
        <Table<Task>
          dataSource={tasks}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize,
            total: totalTasks,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个任务`,
            onChange: (page, size) => {
              setCurrentPage(page);
              if (size !== pageSize) {
                // pageSize change handled through store
              }
            },
          }}
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onDoubleClick: () => {
              if (record.status === 'completed') {
                navigate(`/tasks/${record.id}/transcript`);
              } else {
                navigate(`/tasks/${record.id}`);
              }
            },
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );
};

export default DashboardPage;
