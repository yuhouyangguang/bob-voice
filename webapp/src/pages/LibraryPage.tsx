import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Input,
  Select,
  DatePicker,
  Button,
  Table,
  Typography,
  Space,
  Tag,
  Row,
  Col,
  Empty,
  Tooltip,
  Drawer,
  Descriptions,
  Divider,
  List,
  Avatar,
  Pagination,
  Spin,
  Badge,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  UserOutlined,
  CalendarOutlined,
  FileTextOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { libraryApi } from '../api/library';
import type { Leader, LibraryItem, MeetingType } from '../types';
import { MEETING_TYPE_LABELS } from '../types';
import type { LeaderDetail } from '../api/library';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
};

// Render highlighted_summary safely — only allow <mark> tags
const HighlightedSummary: React.FC<{ html: string | null; fallback: string | null }> = ({
  html,
  fallback,
}) => {
  if (!html && !fallback) return <Text style={{ color: '#6b6b8f' }}>—</Text>;
  if (!html) return <Text style={{ color: '#a0a0c0', fontSize: 13 }}>{fallback}</Text>;

  // Strip all tags except <mark>
  const safe = html
    .replace(/<(?!\/?mark\b)[^>]+>/gi, '')
    .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;');

  return (
    <span
      style={{ color: '#a0a0c0', fontSize: 13 }}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
};

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();

  // Search state
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [total, setTotal] = useState(0);

  // Filters
  const [query, setQuery] = useState('');
  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // Leaders data
  const [leaderNames, setLeaderNames] = useState<string[]>([]);
  const [leaderItems, setLeaderItems] = useState<Leader[]>([]);

  // Leader detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLeader, setDrawerLeader] = useState<LeaderDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [speechPage, setSpeechPage] = useState(1);
  const [speeches, setSpeeches] = useState<Awaited<ReturnType<typeof libraryApi.getLeaderSpeeches>>['items']>([]);
  const [speechTotal, setSpeechTotal] = useState(0);
  const [speechLoading, setSpeechLoading] = useState(false);

  // Debounce query input
  const queryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLeaders = useCallback(async () => {
    try {
      const resp = await libraryApi.getLeaders();
      setLeaderNames(resp.leaders ?? []);
      setLeaderItems(resp.items ?? []);
    } catch (err) {
      console.error('[DEBUG] LibraryPage fetchLeaders error:', err);
    }
  }, []);

  const fetchItems = useCallback(
    async (resetPage = false) => {
      setLoading(true);
      const targetPage = resetPage ? 1 : page;
      if (resetPage) setPage(1);
      try {
        const params: Record<string, unknown> = { page: targetPage, per_page: perPage };
        if (query.trim()) params.q = query.trim();
        if (selectedLeaders.length > 0) params.leader = selectedLeaders.join(',');
        if (selectedTypes.length > 0) params.type = selectedTypes.join(',');
        if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
        if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');

        const resp = await libraryApi.search(params as Parameters<typeof libraryApi.search>[0]);
        setItems(resp.items ?? []);
        setTotal(resp.pagination?.total ?? resp.total ?? 0);
      } catch (err) {
        console.error('[DEBUG] LibraryPage fetchItems error:', err);
      } finally {
        setLoading(false);
      }
    },
    [page, perPage, query, selectedLeaders, selectedTypes, dateRange],
  );

  useEffect(() => {
    fetchLeaders();
  }, [fetchLeaders]);

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearch = () => {
    fetchItems(true);
  };

  const handleReset = () => {
    setQuery('');
    setSelectedLeaders([]);
    setSelectedTypes([]);
    setDateRange(null);
    setPage(1);
    // fetchItems will be triggered by state change via useEffect on page reset
    setTimeout(() => fetchItems(true), 0);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    queryDebounceRef.current = setTimeout(() => fetchItems(true), 500);
  };

  // Open leader detail drawer
  const openLeaderDrawer = async (leaderId: number) => {
    setDrawerOpen(true);
    setDrawerLeader(null);
    setDrawerLoading(true);
    setSpeechPage(1);
    setSpeeches([]);
    try {
      const resp = await libraryApi.getLeaderDetail(leaderId);
      setDrawerLeader(resp.leader);
    } catch (err) {
      console.error('[DEBUG] getLeaderDetail error:', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const fetchSpeeches = useCallback(
    async (leaderId: number, p: number) => {
      setSpeechLoading(true);
      try {
        const resp = await libraryApi.getLeaderSpeeches(leaderId, p, 5);
        setSpeeches(resp.items ?? []);
        setSpeechTotal(resp.pagination?.total ?? 0);
      } catch (err) {
        console.error('[DEBUG] getLeaderSpeeches error:', err);
      } finally {
        setSpeechLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (drawerLeader?.id) {
      fetchSpeeches(drawerLeader.id, speechPage);
    }
  }, [drawerLeader, speechPage, fetchSpeeches]);

  const columns: ColumnsType<LibraryItem> = [
    {
      title: '会议主题',
      key: 'topic',
      ellipsis: true,
      render: (_, record) => (
        <div>
          <Text style={{ color: '#e8e8f0', fontWeight: 500 }}>{record.topic}</Text>
          {record.matched_segment_count > 0 && (
            <Badge
              count={`${record.matched_segment_count} 段`}
              style={{ background: '#2e2e50', color: '#a0a0c0', fontSize: 11, marginLeft: 8 }}
            />
          )}
          {record.highlighted_summary || record.summary ? (
            <div style={{ marginTop: 2 }}>
              <HighlightedSummary
                html={record.highlighted_summary}
                fallback={record.summary}
              />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: '会议类型',
      dataIndex: 'meeting_type',
      width: 90,
      render: (type: MeetingType) => (
        <Tag color="default" style={{ fontSize: 12 }}>
          {MEETING_TYPE_LABELS[type] ?? type}
        </Tag>
      ),
    },
    {
      title: '领导',
      key: 'leaders',
      width: 140,
      render: (_, record) => {
        const list = record.leaders?.length ? record.leaders : record.leader ? [record.leader] : [];
        if (!list.length) return <Text style={{ color: '#4a4a6a' }}>—</Text>;
        return (
          <Space size={4} wrap>
            {list.map((l) => {
              const leaderObj = leaderItems.find((li) => li.name === l);
              return (
                <Tag
                  key={l}
                  icon={<UserOutlined />}
                  color="default"
                  style={{ cursor: leaderObj ? 'pointer' : 'default', fontSize: 12 }}
                  onClick={() => leaderObj && openLeaderDrawer(leaderObj.id)}
                >
                  {l}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
    {
      title: '会议时间',
      dataIndex: 'meeting_at',
      width: 120,
      render: (dt: string | null) =>
        dt ? (
          <Space size={4}>
            <CalendarOutlined style={{ color: '#6b6b8f' }} />
            <Text style={{ color: '#a0a0c0', fontSize: 13 }}>{dayjs(dt).format('YYYY-MM-DD')}</Text>
          </Space>
        ) : (
          <Text style={{ color: '#4a4a6a' }}>—</Text>
        ),
    },
    {
      title: '地点',
      dataIndex: 'location',
      width: 130,
      ellipsis: true,
      render: (loc: string | null) => (
        <Text style={{ color: '#a0a0c0', fontSize: 13 }}>{loc || '—'}</Text>
      ),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: 70,
      render: (d: number | null) => (
        <Text style={{ color: '#a0a0c0', fontSize: 13 }}>{formatDuration(d)}</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 70,
      render: (_, record) => (
        <Tooltip title="查看转写">
          <Button
            type="text"
            icon={<EyeOutlined />}
            size="small"
            style={{ color: '#C41230' }}
            onClick={() => navigate(`/tasks/${record.task_id}/transcript`)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ color: '#e8e8f0', margin: 0 }}>
          档案库
        </Title>
        <Text style={{ color: '#6b6b8f' }}>搜索和浏览历史会议转写档案</Text>
      </div>

      {/* Search filters */}
      <Card
        style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8, marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8} md={7}>
            <Input
              prefix={<SearchOutlined style={{ color: '#4a4a6a' }} />}
              placeholder="搜索主题或正文（空格分词 AND 匹配）"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              mode="multiple"
              placeholder="领导（可多选）"
              value={selectedLeaders}
              onChange={setSelectedLeaders}
              allowClear
              maxTagCount={2}
              style={{ width: '100%' }}
              options={leaderNames.map((l) => ({ value: l, label: l }))}
            />
          </Col>
          <Col xs={24} sm={8} md={5}>
            <Select
              mode="multiple"
              placeholder="会议类型（可多选）"
              value={selectedTypes}
              onChange={setSelectedTypes}
              allowClear
              maxTagCount={2}
              style={{ width: '100%' }}
              options={Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <RangePicker
              value={dateRange}
              onChange={(val) => setDateRange(val as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              style={{ width: '100%' }}
              placeholder={['开始日期', '结束日期']}
              format="YYYY-MM-DD"
            />
          </Col>
          <Col xs={24} sm={12} md={2} style={{ display: 'flex', gap: 8 }}>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              style={{ background: '#C41230', borderColor: '#C41230' }}
            >
              搜索
            </Button>
            <Tooltip title="重置">
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReset}
                style={{ background: '#252545', borderColor: '#2e2e50', color: '#e8e8f0' }}
              />
            </Tooltip>
          </Col>
        </Row>
      </Card>

      {/* Results */}
      <Card
        style={{ background: '#1e1e36', border: '1px solid #2e2e50', borderRadius: 8 }}
        title={
          <Text style={{ color: '#e8e8f0' }}>
            检索结果{' '}
            {total > 0 && (
              <Tag color="default" style={{ marginLeft: 8 }}>
                共 {total} 条
              </Tag>
            )}
          </Text>
        }
      >
        {items.length === 0 && !loading ? (
          <Empty
            description={<Text style={{ color: '#6b6b8f' }}>暂无档案记录</Text>}
            style={{ padding: 60 }}
          />
        ) : (
          <>
            <Table<LibraryItem>
              dataSource={items}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={false}
              scroll={{ x: 900 }}
              onRow={(record) => ({
                onDoubleClick: () => navigate(`/tasks/${record.task_id}/transcript`),
                style: { cursor: 'pointer' },
              })}
            />
            {total > perPage && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <Pagination
                  current={page}
                  pageSize={perPage}
                  total={total}
                  showTotal={(t) => `共 ${t} 条`}
                  onChange={(p) => setPage(p)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </>
        )}
      </Card>

      {/* Leader detail drawer */}
      <Drawer
        title={
          drawerLeader ? (
            <Space>
              <Avatar style={{ background: '#C41230' }} icon={<UserOutlined />} />
              <div>
                <div style={{ color: '#e8e8f0', fontWeight: 600 }}>{drawerLeader.name}</div>
                {drawerLeader.title && (
                  <div style={{ color: '#a0a0c0', fontSize: 12, fontWeight: 400 }}>
                    {drawerLeader.title}
                  </div>
                )}
              </div>
            </Space>
          ) : (
            '领导档案'
          )
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={Math.min(520, window.innerWidth - 24)}
        styles={{
          body: { background: '#1e1e36', padding: 20 },
          header: { background: '#12122a', borderBottom: '1px solid #2a2a4a' },
        }}
      >
        {drawerLoading ? (
          <Spin style={{ display: 'block', margin: '60px auto' }} />
        ) : drawerLeader ? (
          <>
            <Descriptions
              column={2}
              size="small"
              labelStyle={{ color: '#6b6b8f' }}
              contentStyle={{ color: '#e8e8f0' }}
            >
              <Descriptions.Item label="累计会议">{drawerLeader.meeting_count} 场</Descriptions.Item>
              <Descriptions.Item label="发言段落">{drawerLeader.segment_count} 段</Descriptions.Item>
              <Descriptions.Item label="声纹样本">
                {drawerLeader.has_voice_sample ? (
                  <Tag color="success">已采集</Tag>
                ) : (
                  <Tag color="default">未采集</Tag>
                )}
              </Descriptions.Item>
              {drawerLeader.total_duration != null && (
                <Descriptions.Item label="总时长">
                  {formatDuration(drawerLeader.total_duration)}
                </Descriptions.Item>
              )}
            </Descriptions>

            {drawerLeader.keywords?.length > 0 && (
              <>
                <Divider style={{ borderColor: '#2a2a4a', margin: '12px 0' }} />
                <div style={{ marginBottom: 8 }}>
                  <Text style={{ color: '#6b6b8f', fontSize: 12 }}>特征关键词</Text>
                </div>
                <Space wrap>
                  {drawerLeader.keywords.map((kw) => (
                    <Tag key={kw} color="default" style={{ color: '#C41230', borderColor: '#C41230' }}>
                      {kw}
                    </Tag>
                  ))}
                </Space>
              </>
            )}

            <Divider style={{ borderColor: '#2a2a4a', margin: '16px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TeamOutlined style={{ color: '#C41230' }} />
              <Text style={{ color: '#e8e8f0', fontWeight: 500 }}>历史发言</Text>
              <Tag color="default">{speechTotal} 条</Tag>
            </div>

            {speechLoading ? (
              <Spin style={{ display: 'block', margin: '20px auto' }} />
            ) : (
              <>
                <List
                  dataSource={speeches}
                  renderItem={(item) => (
                    <List.Item
                      style={{ borderBottom: '1px solid #2a2a4a', padding: '10px 0' }}
                      actions={[
                        <Button
                          key="view"
                          type="text"
                          icon={<FileTextOutlined />}
                          size="small"
                          style={{ color: '#C41230' }}
                          onClick={() => {
                            setDrawerOpen(false);
                            navigate(`/tasks/${item.task_id}/transcript`);
                          }}
                        />,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Text style={{ color: '#e8e8f0', fontSize: 13 }}>{item.topic}</Text>
                        }
                        description={
                          <Space size={8}>
                            {item.meeting_at && (
                              <Text style={{ color: '#6b6b8f', fontSize: 12 }}>
                                {dayjs(item.meeting_at).format('YYYY-MM-DD')}
                              </Text>
                            )}
                            <Tag color="default" style={{ fontSize: 11 }}>
                              {MEETING_TYPE_LABELS[item.meeting_type as MeetingType] ?? item.meeting_type}
                            </Tag>
                            <Text style={{ color: '#4a4a6a', fontSize: 12 }}>
                              {item.segments?.length ?? 0} 段
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
                {speechTotal > 5 && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                    <Pagination
                      current={speechPage}
                      pageSize={5}
                      total={speechTotal}
                      size="small"
                      onChange={(p) => setSpeechPage(p)}
                      showSizeChanger={false}
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <Empty description="加载失败" />
        )}
      </Drawer>
    </div>
  );
};

export default LibraryPage;
