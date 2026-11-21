import React, { Suspense, lazy, useLayoutEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';

const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-app-shell">
    <div className="flex flex-col items-center gap-4 text-slate-500">
      <div className="w-10 h-10 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
      <span className="text-sm font-medium">正在加载工作空间...</span>
    </div>
  </div>
);

function App() {
  const [theme, setTheme] = useState(() => (
    localStorage.getItem('workspaceTheme') === 'light' ? 'light' : 'dark'
  ));
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('workspaceTheme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((value) => value === 'dark' ? 'light' : 'dark');

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--toast-background)',
            color: 'var(--toast-color)',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<WorkspacePage theme={theme} onToggleTheme={toggleTheme} />} />
          <Route path="/session/:sessionId" element={<SessionDetailPage theme={theme} onToggleTheme={toggleTheme} />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
