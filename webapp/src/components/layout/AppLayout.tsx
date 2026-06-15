import React, { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Badge, Tooltip, Drawer } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  DashboardOutlined,
  AudioOutlined,
  BookOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const MOBILE_BREAKPOINT = 768;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore logout error
    }
    clearAuth();
    navigate('/login');
  };

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path.startsWith('/record')) return 'record';
    if (path.startsWith('/tasks')) return 'tasks';
    if (path.startsWith('/library')) return 'library';
    if (path.startsWith('/admin/corrections')) return 'corrections';
    if (path.startsWith('/admin/users')) return 'users';
    return 'dashboard';
  };

  const handleMenuClick = (path: string) => {
    navigate(path);
    if (isMobile) setDrawerOpen(false);
  };

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '控制台',
      onClick: () => handleMenuClick('/'),
    },
    {
      key: 'record',
      icon: <AudioOutlined />,
      label: '新建转写',
      onClick: () => handleMenuClick('/record'),
    },
    {
      key: 'library',
      icon: <BookOutlined />,
      label: '档案库',
      onClick: () => handleMenuClick('/library'),
    },
    ...(isAdmin
      ? [
          {
            key: 'admin',
            icon: <SettingOutlined />,
            label: '管理',
            children: [
              {
                key: 'corrections',
                icon: <SafetyCertificateOutlined />,
                label: '术语纠错',
                onClick: () => handleMenuClick('/admin/corrections'),
              },
              {
                key: 'users',
                icon: <UserOutlined />,
                label: '用户管理',
                onClick: () => handleMenuClick('/admin/users'),
              },
            ],
          },
        ]
      : []),
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: user?.display_name ?? user?.username ?? '用户',
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  const logoSection = (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
        padding: collapsed && !isMobile ? '0' : '0 20px',
        borderBottom: '1px solid #2a2a4a',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <BankOutlined style={{ fontSize: 24, color: '#C41230', flexShrink: 0 }} />
      {(!collapsed || isMobile) && (
        <div style={{ overflow: 'hidden' }}>
          <div style={{ color: '#C41230', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
            BOB Voice
          </div>
          <div style={{ color: '#6b6b8f', fontSize: 11 }}>智能语音转写</div>
        </div>
      )}
    </div>
  );

  const menuContent = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[getSelectedKey()]}
      defaultOpenKeys={['admin']}
      items={menuItems}
      style={{
        background: '#12122a',
        borderRight: 'none',
        marginTop: 8,
        flex: 1,
      }}
    />
  );

  const siderWidth = collapsed ? 80 : 220;

  return (
    <Layout style={{ minHeight: '100vh', background: '#1a1a2e' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={220}
          style={{
            background: '#12122a',
            borderRight: '1px solid #2a2a4a',
            position: 'fixed',
            height: '100vh',
            left: 0,
            top: 0,
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {logoSection}
          {menuContent}
        </Sider>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={260}
          styles={{
            body: { background: '#12122a', padding: 0 },
            header: { display: 'none' },
          }}
        >
          {logoSection}
          {menuContent}
        </Drawer>
      )}

      <Layout
        style={{
          marginLeft: isMobile ? 0 : siderWidth,
          transition: 'margin-left 0.2s',
        }}
      >
        <Header
          style={{
            background: '#12122a',
            borderBottom: '1px solid #2a2a4a',
            padding: isMobile ? '0 12px' : '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: 64,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {isMobile ? (
              <div
                style={{ cursor: 'pointer', color: '#a0a0c0', fontSize: 20 }}
                onClick={() => setDrawerOpen(true)}
              >
                <MenuOutlined />
              </div>
            ) : (
              <Tooltip title={collapsed ? '展开菜单' : '收起菜单'}>
                <div
                  style={{ cursor: 'pointer', color: '#a0a0c0', fontSize: 18 }}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                </div>
              </Tooltip>
            )}
            {isMobile && (
              <Text style={{ color: '#C41230', fontWeight: 700, fontSize: 15 }}>BOB Voice</Text>
            )}
          </div>

          <Space size={isMobile ? 8 : 16}>
            {!isMobile && (
              <Badge dot status="processing" color="#C41230">
                <Text style={{ color: '#a0a0c0', fontSize: 13 }}>系统正常</Text>
              </Badge>
            )}

            <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar
                  size={32}
                  style={{ background: '#C41230', fontSize: 13, flexShrink: 0 }}
                >
                  {(user?.display_name ?? user?.username ?? 'U')[0].toUpperCase()}
                </Avatar>
                {!isMobile && (
                  <Text style={{ color: '#e8e8f0', fontSize: 13 }}>
                    {user?.display_name ?? user?.username}
                  </Text>
                )}
              </div>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            padding: isMobile ? 12 : 24,
            minHeight: 'calc(100vh - 64px)',
            background: '#1a1a2e',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
