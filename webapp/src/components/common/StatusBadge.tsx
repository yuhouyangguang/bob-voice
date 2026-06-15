import React from 'react';
import { Tag } from 'antd';
import {
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  CloudUploadOutlined,
  AudioOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { TaskStatus } from '../../types';

interface StatusBadgeProps {
  status: TaskStatus;
}

const STATUS_CONFIG: Record<
  TaskStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: 'default',
    icon: <ClockCircleOutlined />,
    label: '等待中',
  },
  uploading: {
    color: 'processing',
    icon: <CloudUploadOutlined />,
    label: '上传中',
  },
  queued: {
    color: 'default',
    icon: <ClockCircleOutlined />,
    label: '排队中',
  },
  processing: {
    color: 'processing',
    icon: <SyncOutlined spin />,
    label: '处理中',
  },
  transcribing: {
    color: 'blue',
    icon: <AudioOutlined />,
    label: '转写中',
  },
  post_processing: {
    color: 'cyan',
    icon: <ToolOutlined />,
    label: '后处理',
  },
  completed: {
    color: 'success',
    icon: <CheckCircleOutlined />,
    label: '已完成',
  },
  failed: {
    color: 'error',
    icon: <CloseCircleOutlined />,
    label: '失败',
  },
  cancelled: {
    color: 'warning',
    icon: <StopOutlined />,
    label: '已取消',
  },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = STATUS_CONFIG[status] ?? {
    color: 'default',
    icon: null,
    label: status,
  };

  return (
    <Tag color={config.color} icon={config.icon} style={{ margin: 0 }}>
      {config.label}
    </Tag>
  );
};

export default StatusBadge;
