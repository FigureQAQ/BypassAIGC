import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const WordFormatterPage = lazy(() => import('./pages/WordFormatterPage'));
const SpecGeneratorPage = lazy(() => import('./pages/SpecGeneratorPage'));
const ArticlePreprocessorPage = lazy(() => import('./pages/ArticlePreprocessorPage'));
const FormatCheckerPage = lazy(() => import('./pages/FormatCheckerPage'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-app-shell">
    <div className="flex flex-col items-center gap-4 text-slate-500">
      <div className="w-10 h-10 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
      <span className="text-sm font-medium">正在加载工作空间...</span>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const authToken = localStorage.getItem('authToken');
  const cardKey = localStorage.getItem('cardKey');
  
  if (!authToken && !cardKey) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
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
          <Route path="/" element={<WelcomePage />} />
          <Route path="/access/:cardKey" element={<WelcomePage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <WorkspacePage />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/session/:sessionId"
          element={
            <ProtectedRoute>
              <SessionDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/word-formatter"
          element={
            <ProtectedRoute>
              <WordFormatterPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/spec-generator"
          element={
            <ProtectedRoute>
              <SpecGeneratorPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/article-preprocessor"
          element={
            <ProtectedRoute>
              <ArticlePreprocessorPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/format-checker"
          element={
            <ProtectedRoute>
              <FormatCheckerPage />
            </ProtectedRoute>
          }
        />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
