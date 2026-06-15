import React, { useState } from 'react';
import { Form, Input, Button, Alert, Typography, Card, Space } from 'antd';
import { UserOutlined, LockOutlined, BankOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const handleSubmit = async (values: LoginForm) => {
    setLoading(true);
    setError(null);

    try {
      const resp = await authApi.login(values.username, values.password);
      setAuth(resp.token, resp.user);
      console.log('[DEBUG] LoginPage login success, user=', resp.user.username);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '用户名或密码错误';
      setError(message);
      console.error('[DEBUG] LoginPage login error:', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Background decoration */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(196, 18, 48, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(30, 30, 120, 0.15) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#1e1e36',
          border: '1px solid #2e2e50',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        styles={{ body: { padding: '32px 24px' } }}
      >
        {/* Logo */}
        <Space direction="vertical" style={{ width: '100%', marginBottom: 32 }} align="center">
          <div
            style={{
              width: 64,
              height: 64,
              background: 'linear-gradient(135deg, #C41230, #8a0d22)',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(196,18,48,0.3)',
            }}
          >
            <BankOutlined style={{ fontSize: 30, color: '#fff' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ color: '#e8e8f0', margin: 0, fontWeight: 700 }}>
              BOB Voice
            </Title>
            <Text style={{ color: '#6b6b8f', fontSize: 13 }}>北京银行智能语音转写系统</Text>
          </div>
        </Space>

        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            style={{ marginBottom: 20, background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)' }}
            closable
            onClose={() => setError(null)}
          />
        )}

        <Form<LoginForm>
          name="login"
          onFinish={handleSubmit}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            label={<Text style={{ color: '#a0a0c0' }}>用户名</Text>}
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#4a4a6a' }} />}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<Text style={{ color: '#a0a0c0' }}>密码</Text>}
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#4a4a6a' }} />}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                fontSize: 15,
                fontWeight: 600,
                background: '#C41230',
                borderColor: '#C41230',
              }}
            >
              {loading ? '登录中...' : '登 录'}
            </Button>
          </Form.Item>
        </Form>

        <Text
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 24,
            color: '#4a4a6a',
            fontSize: 12,
          }}
        >
          © 2026 北京银行股份有限公司 · 内部系统
        </Text>
      </Card>
    </div>
  );
};

export default LoginPage;
