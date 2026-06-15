import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Modal,
  Form,
  Switch,
  InputNumber,
  Select,
  Space,
  Typography,
  Popconfirm,
  message,
  Tag,
  Tooltip,
  Row,
  Col,
  Badge,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import { adminApi, type CorrectionPayload, type Pagination } from '../../api/admin';
import type { Correction } from '../../types';

const { Title, Text } = Typography;

const CATEGORY_OPTIONS = [
  { value: '产品名', label: '产品名' },
  { value: '机构名', label: '机构名' },
  { value: '风控术语', label: '风控术语' },
  { value: '领导表达DNA', label: '领导表达 DNA' },
  { value: '通用', label: '通用' },
];

const ENABLED_OPTIONS = [
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已禁用' },
];

// Map antd column keys to backend sort_by values
const SORT_FIELD_MAP: Record<string, string> = {
  priority: 'priority',
  pattern: 'pattern',
  category: 'category',
  updated_at: 'updated_at',
};

const CorrectionsPage: React.FC = () => {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>();
  const [enabledFilter, setEnabledFilter] = useState<string>();
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 20, total: 0, pages: 0 });
  const [sortBy, setSortBy] = useState<string>();
  const [order, setOrder] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<CorrectionPayload>();

  const fetchCorrections = useCallback(async (page?: number, pageSize?: number) => {
    setLoading(true);
    try {
      const resp = await adminApi.getCorrections({
        q: searchQuery || undefined,
        category: categoryFilter,
        enabled: enabledFilter,
        sort_by: sortBy,
        order,
        page: page ?? pagination.page,
        per_page: pageSize ?? pagination.per_page,
      });
      setCorrections(resp.corrections);
      setPagination(resp.pagination);
    } catch (err) {
      console.error('[DEBUG] CorrectionsPage fetchCorrections error:', err);
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, enabledFilter, sortBy, order, pagination.page, pagination.per_page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCorrections(1);
  }, [searchQuery, categoryFilter, enabledFilter, sortBy, order]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTableChange = (
    pag: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<Correction> | SorterResult<Correction>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const field = s?.columnKey as string | undefined;
    const sortOrder = s?.order;

    if (field && sortOrder && SORT_FIELD_MAP[field]) {
      setSortBy(SORT_FIELD_MAP[field]);
      setOrder(sortOrder === 'ascend' ? 'asc' : 'desc');
    } else {
      setSortBy(undefined);
      setOrder(undefined);
    }

    fetchCorrections(pag.current, pag.pageSize);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      is_regex: false,
      enabled: true,
      priority: undefined,
      category: '通用',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (record: Correction) => {
    setEditingId(record.id);
    form.setFieldsValue({
      pattern: record.pattern,
      replacement: record.replacement,
      category: record.category,
      is_regex: record.is_regex,
      priority: record.priority,
      enabled: record.enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }

    const values = form.getFieldsValue(true) as CorrectionPayload;

    try {
      if (editingId !== null) {
        await adminApi.updateCorrection(editingId, values);
        message.success('已更新');
      } else {
        await adminApi.createCorrection(values);
        message.success('已创建');
      }
      setModalOpen(false);
      fetchCorrections();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        message.error('该规则已存在（pattern + is_regex 重复）');
      } else if (status === 400) {
        message.error('正则表达式语法错误，请检查');
      } else {
        message.error('操作失败，请重试');
      }
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteCorrection(id);
      message.success('已删除');
      fetchCorrections();
    } catch {
      message.error('删除失败');
    }
  };

  const handleToggleEnabled = async (record: Correction) => {
    try {
      await adminApi.updateCorrection(record.id, { enabled: !record.enabled });
      message.success(record.enabled ? '已禁用' : '已启用');
      fetchCorrections();
    } catch {
      message.error('操作失败');
    }
  };

  const handleImport = async (file: File) => {
    try {
      const result = await adminApi.importCorrections(file);
      message.success(`导入完成：新增 ${result.created} 条，更新 ${result.updated} 条`);
      fetchCorrections(1);
    } catch {
      message.error('导入失败，请检查文件格式和内容');
    }
    return false;
  };

  const handleExport = async () => {
    try {
      const blob = await adminApi.exportCorrections({
        q: searchQuery || undefined,
        category: categoryFilter,
        enabled: enabledFilter,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '术语纠正规则.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('导出失败');
    }
  };

  const columns: ColumnsType<Correction> = [
    {
      title: '原词（识别错误）',
      dataIndex: 'pattern',
      key: 'pattern',
      width: 180,
      sorter: true,
      render: (pattern: string, record) => (
        <Space>
          {record.is_regex && (
            <Tooltip title="正则表达式">
              <Tag color="purple" style={{ fontSize: 10 }}>
                正则
              </Tag>
            </Tooltip>
          )}
          <Text
            code
            style={{
              background: '#252545',
              color: '#ff9999',
              fontSize: 13,
            }}
          >
            {pattern}
          </Text>
        </Space>
      ),
    },
    {
      title: '替换为（正确词）',
      dataIndex: 'replacement',
      width: 180,
      render: (replacement: string) => (
        <Text
          code
          style={{
            background: '#252545',
            color: '#99ff99',
            fontSize: 13,
          }}
        >
          {replacement}
        </Text>
      ),
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 110,
      sorter: true,
      render: (cat: string) => {
        const opt = CATEGORY_OPTIONS.find((o) => o.value === cat);
        return <Tag color="default">{opt?.label ?? cat}</Tag>;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      sorter: true,
      render: (p: number) => (
        <Text style={{ color: '#a0a0c0', fontFamily: 'monospace' }}>{p}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 90,
      render: (enabled: boolean) => (
        <Badge
          status={enabled ? 'success' : 'default'}
          text={
            <Text style={{ color: enabled ? '#52c41a' : '#6b6b8f', fontSize: 13 }}>
              {enabled ? '启用' : '禁用'}
            </Text>
          }
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 130,
      sorter: true,
      render: (dt: string) => (
        <Text style={{ color: '#a0a0c0', fontSize: 12 }}>
          {dayjs(dt).format('MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={record.enabled ? '禁用' : '启用'}>
            <Switch
              size="small"
              checked={record.enabled}
              onChange={() => handleToggleEnabled(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              style={{ color: '#1677ff' }}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除此纠错规则？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button
                type="text"
                icon={<DeleteOutlined />}
                size="small"
                style={{ color: '#ff4d4f' }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
          <SafetyCertificateOutlined style={{ color: '#C41230', marginRight: 8 }} />
          术语纠错管理
        </Title>
        <Text style={{ color: '#6b6b8f' }}>管理语音识别后的术语自动纠错规则</Text>
      </div>

      <Card
        style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
        title={
          <div>
            <div style={{ marginBottom: 8 }}>
              <Text style={{ color: '#e8e8f0' }}>
                纠错规则列表
                <Tag style={{ marginLeft: 8 }} color="default">
                  共 {pagination.total} 条
                </Tag>
              </Text>
            </div>
            <Space wrap size={8}>
              <Input
                prefix={<SearchOutlined style={{ color: '#4a4a6a' }} />}
                placeholder="搜索规则"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onPressEnter={() => fetchCorrections(1)}
                allowClear
                style={{ width: 180, minWidth: 140 }}
              />
              <Select
                placeholder="全部分类"
                value={categoryFilter}
                onChange={setCategoryFilter}
                allowClear
                options={CATEGORY_OPTIONS}
                style={{ width: 130 }}
              />
              <Select
                placeholder="全部状态"
                value={enabledFilter}
                onChange={setEnabledFilter}
                allowClear
                options={ENABLED_OPTIONS}
                style={{ width: 110 }}
              />
              <Upload
                accept=".csv,.xlsx"
                showUploadList={false}
                beforeUpload={(file) => handleImport(file as File)}
              >
                <Button icon={<UploadOutlined />}>导入</Button>
              </Upload>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                导出
              </Button>
              <Tooltip title="刷新">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => fetchCorrections()}
                  style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
                />
              </Tooltip>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenCreate}
                style={{ background: '#C41230', borderColor: '#C41230' }}
              >
                添加规则
              </Button>
            </Space>
          </div>
        }
        styles={{ header: { borderBottom: '1px solid #2e2e50' } }}
      >
        <Table<Correction>
          dataSource={corrections}
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
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={
          <Text style={{ color: '#e8e8f0' }}>
            {editingId !== null ? '编辑纠错规则' : '添加纠错规则'}
          </Text>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingId !== null ? '保存' : '添加'}
        cancelText="取消"
        okButtonProps={{ style: { background: '#C41230', borderColor: '#C41230' } }}
        style={{ background: '#1e1e36' }}
        width={540}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="pattern"
                label={<Text style={{ color: '#a0a0c0' }}>识别错误词</Text>}
                rules={[{ required: true, message: '请输入识别错误词' }]}
              >
                <Input placeholder="如：封控工作" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="replacement"
                label={<Text style={{ color: '#a0a0c0' }}>替换为正确词</Text>}
                rules={[{ required: true, message: '请输入正确词' }]}
              >
                <Input placeholder="如：风控工作" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="category"
                label={<Text style={{ color: '#a0a0c0' }}>类别</Text>}
              >
                <Select options={CATEGORY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="priority"
                label={<Text style={{ color: '#a0a0c0' }}>优先级（留空按词长自动计算）</Text>}
              >
                <InputNumber min={0} max={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[24, 0]}>
            <Col>
              <Form.Item
                name="is_regex"
                label={<Text style={{ color: '#a0a0c0' }}>正则表达式</Text>}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col>
              <Form.Item
                name="enabled"
                label={<Text style={{ color: '#a0a0c0' }}>启用</Text>}
                valuePropName="checked"
              >
                <Switch defaultChecked />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default CorrectionsPage;
