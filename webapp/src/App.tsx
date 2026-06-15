import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import ProtectedRoute from './components/common/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

// Pages (lazy loaded for better performance)
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const RecordPage = React.lazy(() => import('./pages/RecordPage'));
const TaskProgressPage = React.lazy(() => import('./pages/TaskProgressPage'));
const TranscriptPage = React.lazy(() => import('./pages/TranscriptPage'));
const LibraryPage = React.lazy(() => import('./pages/LibraryPage'));
const CorrectionsPage = React.lazy(() => import('./pages/admin/CorrectionsPage'));
const UsersPage = React.lazy(() => import('./pages/admin/UsersPage'));

const PageLoader: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#1a1a2e',
    }}
  >
    <Spin size="large" />
  </div>
);

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes wrapped in layout */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index path="/" element={<DashboardPage />} />
            <Route path="/record" element={<RecordPage />} />
            <Route path="/tasks/:id" element={<TaskProgressPage />} />
            <Route path="/tasks/:id/transcript" element={<TranscriptPage />} />
            <Route path="/library" element={<LibraryPage />} />

            {/* Admin-only routes */}
            <Route
              path="/admin/corrections"
              element={
                <ProtectedRoute adminOnly>
                  <CorrectionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute adminOnly>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
