import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';
import './index.css';
import App from './App';
import antdTheme from './theme/antdTheme';

// Configure dayjs
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found. Make sure index.html has <div id="root"></div>');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
