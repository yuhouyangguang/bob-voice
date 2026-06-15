import React, { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CrownOutlined,
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import { adminApi, type UserPayload, type Pagination, type UserStats } from '../../api/admin';
import type { AdminUser } from '../../types';

const { Title, Text } = Typography;

const ROLE_OPTIONS = [
  { value: 'user', label: '普通用户' },
  { value: 'advanced', label: '高级用户' },
  { value: 'admin', label: '管理员' },
];

const ACTIVE_OPTIONS = [
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已停用' },
];

const ROLE_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  admin: { color: '#C41230', label: '管理员', icon: <CrownOutlined /> },
  advanced: { color: '#722ed1', label: '高级用户', icon: <TeamOutlined /> },
  user: { color: '#1677ff', label: '普通用户', icon: <UserOutlined /> },
};

type UserFormValues = UserPayload & {
  username: string;
  password: string;
};

// Password: >=8 chars, upper + lower + digit + special
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>();
  const [activeFilter, setActiveFilter] = useState<string>();
  const [stats, setStats] = useState<UserStats>({ total: 0, active: 0, inactive: 0, locked: 0 });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 20, total: 0, pages: 0 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState('');
  const [form] = Form.useForm<UserFormValues>();

  const fetchUsers = useCallback(async (page?: number, pageSize?: number) => {
    setLoading(true);
    try {
      const resp = await adminApi.getUsers({
        q: query || undefined,
        role: roleFilter,
        active: activeFilter,
        page: page ?? pagination.page,
        per_page: pageSize ?? pagination.per_page,
      });
      setUsers(resp.users);
      setStats(resp.stats);
      setPagination(resp.pagination);
    } catch {
      message.error('用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter, activeFilter, pagination.page, pagination.per_page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers(1);
  }, [query, roleFilter, activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchUsers(pag.current, pag.pageSize);
  };

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user', is_active: true });
    setEditorOpen(true);
  };

  const openEdit = (user: AdminUser) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      display_name: user.display_name,
      email: user.email ?? undefined,
      department: user.department ?? undefined,
      role: user.role,
      is_active: user.is_active,
      password: '',
    });
    setEditorOpen(true);
  };

  const saveUser = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        await adminApi.updateUser(editingUser.id, {
          display_name: values.display_name,
          email: values.email,
          department: values.department,
          role: values.role,
          is_active: values.is_active,
        });
        message.success('用户信息已更新');
      } else {
        await adminApi.createUser(values);
        message.success('用户已创建');
      }
      setEditorOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        message.error('操作被拒绝：不能停用/降级自己，或系统需保留至少一个管理员');
      } else if (status === 400) {
        message.error('参数错误，请检查输入');
      } else if (err instanceof Error && !status) {
        // form validation error, do nothing
      } else {
        message.error('操作失败');
      }
    }
  };

  const toggleUser = async (user: AdminUser) => {
    try {
      await adminApi.updateUser(user.id, { is_active: !user.is_active });
      message.success(user.is_active ? '用户已停用' : '用户已启用');
      fetchUsers();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        message.error('操作被拒绝：不能停用自己，或系统需保留至少一个管理员');
      } else {
        message.error('状态更新失败');
      }
    }
  };

  const unlockUser = async (user: AdminUser) => {
    try {
      await adminApi.unlockUser(user.id);
      message.success('账号已解锁');
      fetchUsers();
    } catch {
      message.error('解锁失败');
    }
  };

  const resetPassword = async () => {
    if (!passwordUser) return;
    if (!PASSWORD_REGEX.test(password)) {
      message.error('密码至少 8 位，须同时包含大小写字母、数字和特殊字符');
      return;
    }
    try {
      await adminApi.resetUserPassword(passwordUser.id, password);
      message.success('密码已重置');
      setPasswordUser(null);
      setPassword('');
    } catch {
      message.error('密码重置失败');
    }
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <Space size={12}>
          <Avatar
            size={36}
            style={{ background: ROLE_CONFIG[record.role]?.color ?? '#4a4a6a' }}
          >
            {(record.display_name || record.username)[0].toUpperCase()}
          </Avatar>
          <div>
            <Text style={{ color: '#e8e8f0', fontWeight: 500, display: 'block' }}>
              {record.display_name}
            </Text>
            <Text style={{ color: '#6b6b8f', fontSize: 12 }}>
              @{record.username}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      width: 140,
      render: (value: string | null) => value || '—',
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (role: string) => {
        const config = ROLE_CONFIG[role] ?? { color: 'default', label: role, icon: null };
        return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 100,
      render: (active: boolean, record) => (
        <Space direction="vertical" size={0}>
          <Badge
            status={active ? 'success' : 'default'}
            text={active ? '启用' : '停用'}
          />
          {record.locked_until && (
            <Text style={{ color: '#ff7875', fontSize: 11 }}>已锁定</Text>
          )}
        </Space>
      ),
    },
    {
      title: '任务数',
      dataIndex: 'task_count',
      width: 80,
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      width: 150,
      render: (value: string | null) => (
        <Text style={{ color: '#a0a0c0', fontSize: 12 }}>
          {value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '从未登录'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 190,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Tooltip title="重置密码">
            <Button
              type="text"
              icon={<LockOutlined />}
              onClick={() => {
                setPassword('');
                setPasswordUser(record);
              }}
            />
          </Tooltip>
          {record.locked_until && (
            <Tooltip title="解锁">
              <Button
                type="text"
                icon={<UnlockOutlined />}
                onClick={() => unlockUser(record)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title={record.is_active ? '确认停用该用户？' : '确认启用该用户？'}
            onConfirm={() => toggleUser(record)}
          >
            <Switch size="small" checked={record.is_active} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
          <TeamOutlined style={{ color: '#C41230', marginRight: 8 }} />
          用户管理
        </Title>
        <Text style={{ color: '#6b6b8f' }}>管理本地账号、角色和启用状态</Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card><Statistic title="总用户" value={stats.total} /></Card>
        </Col>
        <Col xs={6}>
          <Card><Statistic title="启用用户" value={stats.active} /></Card>
        </Col>
        <Col xs={6}>
          <Card><Statistic title="停用用户" value={stats.inactive} /></Card>
        </Col>
        <Col xs={6}>
          <Card><Statistic title="已锁定" value={stats.locked} valueStyle={stats.locked > 0 ? { color: '#ff7875' } : undefined} /></Card>
        </Col>
      </Row>

      <Card
        title="用户列表"
        extra={
          <Space wrap>
            <Input
              placeholder="工号、姓名、部门或邮箱"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => fetchUsers(1)}
              allowClear
              style={{ width: 200, minWidth: 140 }}
            />
            <Select
              placeholder="全部角色"
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_OPTIONS}
              allowClear
              style={{ width: 120 }}
            />
            <Select
              placeholder="全部状态"
              value={activeFilter}
              onChange={setActiveFilter}
              options={ACTIVE_OPTIONS}
              allowClear
              style={{ width: 110 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建用户
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.per_page,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 950 }}
        />
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={saveUser}
        okText="保存"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label="工号"
            rules={[
              { required: !editingUser, message: '请输入工号' },
              { pattern: /^[A-Za-z0-9._-]{3,64}$/, message: '3-64位字母、数字、点、下划线或连字符' },
            ]}
          >
            <Input disabled={Boolean(editingUser)} />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password"
              label="初始密码"
              rules={[
                { required: true, message: '请输入密码' },
                {
                  pattern: PASSWORD_REGEX,
                  message: '至少8位，须包含大小写字母、数字和特殊字符',
                },
              ]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="display_name" label="显示姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="department" label="部门"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input type="email" /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="is_active" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`重置 ${passwordUser?.display_name ?? ''} 的密码`}
        open={Boolean(passwordUser)}
        onCancel={() => setPasswordUser(null)}
        onOk={resetPassword}
        okText="重置密码"
      >
        <Input.Password
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少8位，须包含大小写字母、数字和特殊字符"
        />
      </Modal>
    </div>
  );
};

export default UsersPage;
