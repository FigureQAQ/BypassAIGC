import React, {
  useState, useEffect, useCallback, useMemo, memo, useRef, useDeferredValue,
} from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileText, History, Play, Upload, X,
  Users, Clock, AlertCircle, CheckCircle, Trash2, Info,
  Search, Square, Sparkles, Wand2, LayoutTemplate, ShieldCheck,
  ChevronRight, Activity,
} from 'lucide-react';
import { optimizationAPI } from '../api';

const TOOL_LINKS = [
  {
    title: 'Word 智能排版',
    description: '快速生成规范论文文档',
    path: '/word-formatter',
    icon: LayoutTemplate,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    title: '格式规范生成',
    description: '用自然语言创建排版规范',
    path: '/spec-generator',
    icon: Wand2,
    color: 'from-violet-500 to-fuchsia-500',
  },
  {
    title: '文章预处理',
    description: '分块清洗并保持结构完整',
    path: '/article-preprocessor',
    icon: Sparkles,
    color: 'from-amber-500 to-orange-500',
  },
  {
    title: '格式检查',
    description: '无需 AI 即可检测格式问题',
    path: '/format-checker',
    icon: ShieldCheck,
    color: 'from-emerald-500 to-teal-500',
  },
];

const getSessionErrorSummary = (errorMessage) => {
  if (!errorMessage) {
    return '网络连接超时，请稍后重试';
  }

  const normalizedError = errorMessage.toLowerCase();
  if (normalizedError.includes('invalid_api_key')
    || normalizedError.includes('incorrect api key')
    || normalizedError.includes('api key 未配置')) {
    return 'API Key 无效或未配置，请更新 .env 后重试';
  }
  if (normalizedError.includes('base url')) {
    return 'API Base URL 配置错误，请检查 .env';
  }
  if (normalizedError.includes('rate_limit') || normalizedError.includes('429')) {
    return 'API 请求过于频繁或余额不足，请稍后重试';
  }
  if (normalizedError.includes('timeout') || normalizedError.includes('超时')) {
    return 'API 请求超时，请稍后继续处理';
  }

  return errorMessage
    .replace(/^段落\s*\d+\s*在\s*\w+\s*阶段失败[:：]\s*/i, '')
    .replace(/^ai调用失败[:：]\s*/i, '')
    .slice(0, 120);
};

// 会话列表项组件 - 使用 memo 避免不必要重渲染
const SessionItem = memo(({ session, activeSession, onView, onDelete, onRetry }) => {
  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(session);
  }, [session, onDelete]);

  const handleRetry = useCallback((e) => {
    e.stopPropagation();
    if (session.status === 'failed') {
      onRetry(session);
    }
  }, [session, onRetry]);

  const handleView = useCallback(() => {
    onView(session.session_id);
  }, [session.session_id, onView]);

  const errorSummary = getSessionErrorSummary(session.error_message);

  return (
    <div
      onClick={handleView}
      className="group p-3 rounded-xl hover:bg-gray-50 transition-all cursor-pointer border border-transparent hover:border-gray-100 relative"
    >
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5">
          {session.status === 'completed' && (
            <CheckCircle className="w-4 h-4 text-ios-green" />
          )}
          {session.status === 'processing' && (
            <div className="w-4 h-4 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
          )}
          {session.status === 'failed' && (
            <AlertCircle className="w-4 h-4 text-ios-red" />
          )}
          {session.status === 'stopped' && (
            <AlertCircle className="w-4 h-4 text-orange-500" />
          )}
          <span className={`text-[13px] font-medium ${
            session.status === 'completed' ? 'text-black' :
            session.status === 'processing' ? 'text-ios-blue' :
            session.status === 'failed' ? 'text-ios-red' :
            session.status === 'stopped' ? 'text-orange-600' : 'text-ios-gray'
          }`}>
            {session.status === 'completed' && '已完成'}
            {session.status === 'processing' && '处理中'}
            {session.status === 'queued' && '排队中'}
            {session.status === 'failed' && '失败'}
            {session.status === 'stopped' && '已停止'}
          </span>
        </div>

        <span className="text-[11px] text-ios-gray/70 font-medium">
          {new Date(session.created_at).toLocaleDateString()}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
          session.source_type === 'docx' ? 'bg-blue-50 text-ios-blue' :
          session.source_type === 'pdf' ? 'bg-red-50 text-ios-red' :
          session.source_type === 'md' ? 'bg-purple-50 text-purple-600' :
          'bg-gray-100 text-ios-gray'
        }`}>
          {session.source_type === 'docx' ? 'Word' : session.source_type === 'pdf' ? 'PDF' : session.source_type === 'md' ? 'MD' : '文本'}
        </span>
        {(session.word_count > 0 || session.original_char_count > 0) && (
          <span className="text-[11px] text-ios-gray">
            {session.word_count > 0 ? `${session.word_count} 字/词` : `${session.original_char_count} 字符`}
          </span>
        )}
      </div>

      <p className="text-[13px] text-ios-gray leading-snug line-clamp-2 mb-2 pr-6">
        {session.source_filename || session.preview_text || '暂无预览'}
      </p>

      {session.status === 'processing' && (
        <div className="w-full bg-gray-100 rounded-full h-1 mb-1">
          <div
            className="bg-ios-blue h-1 rounded-full"
            style={{ width: `${session.progress}%` }}
          />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-between mt-1">
        {session.status === 'failed' && (
          <button
            onClick={handleRetry}
            className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
          >
            继续处理
          </button>
        )}
        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-300 hover:text-ios-red hover:bg-red-50 rounded-lg transition-colors ml-auto"
          title="删除会话"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {session.status === 'failed' && session.current_position < session.total_segments && (
        <div
          className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ios-red bg-red-50 px-2 py-1.5 rounded-lg mt-1 break-words"
          title={session.error_message || errorSummary}
        >
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{errorSummary}</span>
        </div>
      )}
    </div>
  );
});

SessionItem.displayName = 'SessionItem';

const WorkspacePage = () => {
  const [text, setText] = useState('');
  const [inputMode, setInputMode] = useState('file');
  const [selectedFile, setSelectedFile] = useState(null);
  const [processingMode, setProcessingMode] = useState('paper_polish_enhance');
  const [sessions, setSessions] = useState([]);
  const [queueStatus, setQueueStatus] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [isDocumentHidden, setIsDocumentHidden] = useState(document.hidden);
  const fileInputRef = useRef(null);
  const sessionsRequestRef = useRef(false);
  const queueRequestRef = useRef(false);
  const progressRequestRef = useRef(false);
  const navigate = useNavigate();
  const deferredSessionSearch = useDeferredValue(sessionSearch);

  // 使用 useCallback 优化函数引用稳定性
  const loadSessions = useCallback(async () => {
    if (sessionsRequestRef.current) {
      return;
    }

    try {
      sessionsRequestRef.current = true;
      setIsLoadingSessions(true);
      const response = await optimizationAPI.listSessions();
      setSessions(response.data);

      // 查找正在处理的会话
      const processing = response.data.find(
        s => s.status === 'processing' || s.status === 'queued'
      );
      setActiveSession(processing ? processing.session_id : null);
    } catch (error) {
      console.error('加载会话失败:', error);
    } finally {
      sessionsRequestRef.current = false;
      setIsLoadingSessions(false);
    }
  }, []);

  // loadQueueStatus 不依赖 activeSession，避免 useEffect 重复触发
  const loadQueueStatus = useCallback(async () => {
    if (queueRequestRef.current) {
      return;
    }

    try {
      queueRequestRef.current = true;
      const response = await optimizationAPI.getQueueStatus();
      setQueueStatus(response.data);
    } catch (error) {
      console.error('加载队列状态失败:', error);
    } finally {
      queueRequestRef.current = false;
    }
  }, []);

  const updateSessionProgress = useCallback(async (sessionId) => {
    if (progressRequestRef.current) {
      return;
    }

    try {
      progressRequestRef.current = true;
      const response = await optimizationAPI.getSessionProgress(sessionId);
      const progress = response.data;

      // 更新会话列表中的进度 - 只在数据有变化时更新
      setSessions(prev => {
        const target = prev.find(s => s.session_id === sessionId);
        if (target && target.progress === progress.progress && target.status === progress.status) {
          return prev; // 无变化，不触发重渲染
        }
        return prev.map(s =>
          s.session_id === sessionId ? { ...s, ...progress } : s
        );
      });

      // 如果会话完成,刷新列表
      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'stopped') {
        setActiveSession(null);
        loadSessions();

        if (progress.status === 'completed') {
          toast.success('优化完成!');
        } else if (progress.status === 'failed') {
          toast.error(`优化失败: ${progress.error_message}`);
        }
      }
    } catch (error) {
      console.error('更新进度失败:', error);
    } finally {
      progressRequestRef.current = false;
    }
  }, [loadSessions]);

  // 初始加载 - 只在组件挂载时执行一次
  useEffect(() => {
    loadSessions();
    loadQueueStatus();
  }, [loadSessions, loadQueueStatus]);

  // 队列状态轮询 - 独立的 useEffect，避免与初始加载混淆
  useEffect(() => {
    const interval = setInterval(loadQueueStatus, isDocumentHidden ? 60000 : 15000);
    return () => clearInterval(interval);
  }, [isDocumentHidden, loadQueueStatus]);

  useEffect(() => {
    if (activeSession) {
      const interval = setInterval(() => {
        updateSessionProgress(activeSession);
      }, isDocumentHidden ? 15000 : 3000);
      return () => clearInterval(interval);
    }
  }, [activeSession, isDocumentHidden, updateSessionProgress]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentHidden(document.hidden);
      if (!document.hidden) {
        loadQueueStatus();
        if (activeSession) {
          updateSessionProgress(activeSession);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeSession, loadQueueStatus, updateSessionProgress]);

  const validateFile = useCallback((file) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['docx', 'pdf', 'md', 'markdown'].includes(ext)) {
      toast.error('仅支持 Word、PDF 和 Markdown 文档');
      return false;
    }
    return true;
  }, []);

  const handleFileSelect = useCallback((file) => {
    if (!file || !validateFile(file)) {
      return;
    }
    setSelectedFile(file);
  }, [validateFile]);

  const handleStartOptimization = useCallback(async () => {
    if (inputMode === 'text' && !text.trim()) {
      toast.error('请输入要优化的文本');
      return;
    }

    if (inputMode === 'file' && !selectedFile) {
      toast.error('请选择要优化的文档');
      return;
    }

    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      const response = inputMode === 'file'
        ? await optimizationAPI.startOptimizationFile(selectedFile, { processing_mode: processingMode })
        : await optimizationAPI.startOptimization({
            original_text: text,
            processing_mode: processingMode,
          });

      setActiveSession(response.data.session_id);
      toast.success('优化任务已启动');
      setText('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadSessions();
    } catch (error) {
      toast.error('启动优化失败: ' + (error.response?.data?.detail || '未知错误'));
    } finally {
      setIsSubmitting(false);
    }
  }, [inputMode, text, selectedFile, processingMode, isSubmitting, loadSessions]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('cardKey');
    localStorage.removeItem('authToken');
    navigate('/');
  }, [navigate]);

  const handleStopSession = useCallback(async () => {
    if (!activeSession || isStopping) {
      return;
    }

    try {
      setIsStopping(true);
      await optimizationAPI.stopSession(activeSession);
      toast.success('任务已停止');
      setActiveSession(null);
      await loadSessions();
    } catch (error) {
      toast.error(error.response?.data?.detail || '停止任务失败');
    } finally {
      setIsStopping(false);
    }
  }, [activeSession, isStopping, loadSessions]);

  const handleDeleteSession = useCallback(async (session) => {
    const confirmDelete = window.confirm('确认删除该会话及其结果吗?');
    if (!confirmDelete) {
      return;
    }

    try {
      await optimizationAPI.deleteSession(session.session_id);
      if (activeSession === session.session_id) {
        setActiveSession(null);
      }
      toast.success('会话已删除');
      await loadSessions();
    } catch (error) {
      console.error('删除会话失败:', error);
      toast.error(error.response?.data?.detail || '删除会话失败');
    }
  }, [activeSession, loadSessions]);

  const handleViewSession = useCallback((sessionId) => {
    navigate(`/session/${sessionId}`);
  }, [navigate]);

  const handleRetrySegment = useCallback(async (session) => {
    if (session.status !== 'failed') {
      return;
    }

    const confirmRetry = window.confirm('检测到会话执行失败。是否继续处理未完成的段落?');
    if (!confirmRetry) {
      return;
    }

    try {
      const response = await optimizationAPI.retryFailedSegments(session.session_id);
      setActiveSession(session.session_id);
      toast.success(response.data?.message || '已重新继续处理未完成段落');
      await loadSessions();
    } catch (error) {
      console.error('重试失败:', error);
      toast.error(error.response?.data?.detail || '重试失败，请稍后再试');
    }
  }, [loadSessions]);

  // 使用 useMemo 缓存当前活跃会话的数据
  const currentActiveSessionData = useMemo(() => {
    return sessions.find(s => s.session_id === activeSession);
  }, [sessions, activeSession]);

  const sessionStats = useMemo(() => ({
    total: sessions.length,
    completed: sessions.filter(session => session.status === 'completed').length,
    running: sessions.filter(
      session => session.status === 'processing' || session.status === 'queued',
    ).length,
  }), [sessions]);

  const filteredSessions = useMemo(() => {
    const keyword = deferredSessionSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesFilter = sessionFilter === 'all'
        || (sessionFilter === 'active' && ['processing', 'queued'].includes(session.status))
        || session.status === sessionFilter;
      if (!matchesFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [
        session.source_filename,
        session.preview_text,
        session.session_id,
      ].some(value => value?.toLowerCase().includes(keyword));
    });
  }, [deferredSessionSearch, sessionFilter, sessions]);


  return (
    <div className="min-h-screen bg-app-shell">
      {/* 顶部导航栏 - iOS Glass Style */}
      <nav className="bg-white/70 backdrop-blur-2xl border-b border-white/80 sticky top-0 z-50 shadow-[0_1px_20px_rgba(15,23,42,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[52px]">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">
                  AI 学术工作台
                </h1>
                <p className="hidden sm:block text-[11px] text-slate-500">写作、排版与质量检查</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* 队列状态 */}
              {queueStatus && (
                <div className="flex items-center gap-3 text-[13px]">
                  <div className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md">
                    <Users className="w-3.5 h-3.5 text-ios-gray" />
                    <span className="text-ios-gray font-medium">
                      {queueStatus.current_users}/{queueStatus.max_users}
                    </span>
                  </div>
                  {queueStatus.queue_length > 0 && (
                    <div className="flex items-center gap-1.5 bg-orange-50 px-2 py-1 rounded-md">
                      <Clock className="w-3.5 h-3.5 text-ios-orange" />
                      <span className="text-ios-orange font-medium">
                        {queueStatus.queue_length} 排队
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              <button
                onClick={handleLogout}
                className="text-ios-red text-[17px] hover:opacity-70 transition-opacity font-normal"
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        <section className="relative overflow-hidden rounded-[28px] bg-slate-950 text-white p-6 sm:p-8 mb-6 shadow-2xl shadow-slate-900/15">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.45),transparent_28rem),radial-gradient(circle_at_85%_0%,rgba(124,58,237,0.4),transparent_24rem)]" />
          <div className="absolute -right-20 -bottom-32 w-80 h-80 border border-white/10 rounded-full" />
          <div className="relative grid lg:grid-cols-[1.25fr_1fr] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs text-blue-100 mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                一站式学术写作与文档处理
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl">
                从文档上传到结果导出，
                <span className="text-blue-300">一次完成。</span>
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                创建新的语言优化任务，或进入专业工具处理 Word 排版、格式检查和文章预处理。
              </p>
              <div className="grid grid-cols-3 gap-3 mt-6 max-w-lg">
                {[
                  { label: '全部任务', value: sessionStats.total, icon: History },
                  { label: '已完成', value: sessionStats.completed, icon: CheckCircle },
                  { label: '进行中', value: sessionStats.running, icon: Activity },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                    <Icon className="w-4 h-4 text-blue-300 mb-2" />
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-[11px] text-slate-300 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {TOOL_LINKS.map(({ title, description, path, icon: Icon, color }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className="group text-left rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 p-4 transition-all hover:-translate-y-0.5"
                >
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg mb-3`}>
                    <Icon className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{title}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧 - 输入区域 */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 说明卡片 */}
            <div className="surface-card rounded-2xl overflow-hidden">
              <div className="p-4 flex items-start gap-3 bg-blue-50/50">
                <Info className="w-5 h-5 text-ios-blue flex-shrink-0 mt-0.5" />
                <div className="text-[15px] text-black">
                  <p className="font-semibold mb-1 text-ios-blue">当前模式说明</p>
                  <p className="text-gray-700 leading-relaxed">
                    {processingMode === 'paper_polish' && '仅降低 AIGC 率，优化表达并降低文本 AI 痕迹。'}
                    {processingMode === 'paper_enhance' && '直接进行降重，改写表达并降低重复率。'}
                    {processingMode === 'paper_polish_enhance' && '先降低 AIGC 率，再自动进行降重，两阶段处理。'}
                    {processingMode === 'emotion_polish' && '专为感情文章设计，生成更自然、更具人性化的表达。'}
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-card rounded-2xl p-5">
              <div className="mb-4 pl-1">
                <h2 className="text-[20px] font-bold text-black tracking-tight">提交文档</h2>
                <p className="text-[12px] text-ios-gray mt-1">
                  Word 文档优先，自动保留原文档结构
                </p>
              </div>
              
              {/* 处理模式选择 - iOS Segmented Control Style */}
              <div className="mb-5">
                <label className="block text-[13px] font-medium text-ios-gray mb-2 ml-1 uppercase tracking-wide">
                  选择模式
                </label>
                <div className="grid md:grid-cols-2 gap-3">
                  {[
                    { id: 'paper_polish', title: '降低 AIGC 率', desc: '优化表达，降低 AI 痕迹' },
                    { id: 'paper_enhance', title: '降重', desc: '改写表达，降低重复率' },
                    { id: 'paper_polish_enhance', title: '降低 AIGC 率 + 降重', desc: '先降低 AI 痕迹，再进行降重' },
                    { id: 'emotion_polish', title: '自然表达', desc: '适合感情和生活类文章' }
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      className={`flex items-center p-3.5 rounded-xl cursor-pointer transition-all border ${
                        processingMode === mode.id
                          ? 'bg-blue-50 border-ios-blue ring-1 ring-ios-blue/20'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="processingMode"
                        value={mode.id}
                        checked={processingMode === mode.id}
                        onChange={(e) => setProcessingMode(e.target.value)}
                        className="mr-3 w-5 h-5 text-ios-blue focus:ring-ios-blue border-gray-300"
                      />
                      <div>
                        <div className={`font-semibold text-[15px] ${processingMode === mode.id ? 'text-ios-blue' : 'text-black'}`}>
                          {mode.title}
                        </div>
                        <div className="text-[13px] text-ios-gray mt-0.5">
                          {mode.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="mb-4 grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-xl w-full">
                <button
                  onClick={() => setInputMode('file')}
                  className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition-all ${inputMode === 'file' ? 'bg-white text-black shadow-sm' : 'text-ios-gray'}`}
                >
                  上传文档
                  <span className="block text-[10px] font-normal text-ios-gray mt-0.5">Word / PDF / Markdown</span>
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition-all ${inputMode === 'text' ? 'bg-white text-black shadow-sm' : 'text-ios-gray'}`}
                >
                  粘贴文本
                  <span className="block text-[10px] font-normal text-ios-gray mt-0.5">适合短文本</span>
                </button>
              </div>

              {inputMode === 'text' ? (
                <div className="relative">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="在此粘贴您的内容..."
                    className="w-full h-64 px-4 py-3 bg-gray-50 rounded-xl focus:bg-white focus:ring-2 focus:ring-ios-blue/20 transition-all text-[16px] leading-relaxed text-black placeholder-gray-400 border-none outline-none resize-none"
                  />
                  <div className="absolute bottom-3 right-3 text-[12px] text-ios-gray bg-white/80 px-2 py-1 rounded-md backdrop-blur-sm">
                    {text.length} 字
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleFileSelect(e.dataTransfer.files?.[0]);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    className="w-full min-h-[280px] border-2 border-dashed border-blue-200 rounded-2xl bg-gradient-to-b from-blue-50/70 to-white hover:bg-white hover:border-ios-blue transition-all flex flex-col items-center justify-center text-center p-6"
                  >
                    <Upload className="w-10 h-10 text-ios-blue mb-3" />
                    <div className="text-[16px] font-semibold text-black mb-1">
                      点击选择或拖拽上传 Word 文档
                    </div>
                    <div className="text-[13px] text-ios-gray">
                      支持 .docx、.pdf、.md、.markdown
                    </div>
                    <div className="text-[12px] text-ios-gray mt-2 max-w-md">
                      Word 会优先保留原格式，仅处理摘要、正文和致谢中的普通段落。
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf,.md,.markdown"
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    className="hidden"
                  />
                  {selectedFile && (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                      <div>
                        <div className="text-[14px] font-semibold text-black">{selectedFile.name}</div>
                        <div className="text-[12px] text-ios-gray">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-1.5 text-ios-gray hover:text-ios-red rounded-lg hover:bg-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleStartOptimization}
                  disabled={(inputMode === 'text' ? !text.trim() : !selectedFile) || activeSession || isSubmitting}
                  className="flex items-center gap-2 bg-ios-blue hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-xl transition-all active:scale-[0.98] shadow-sm text-[17px]"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      提交中...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      开始优化
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 活跃会话进度 */}
            {activeSession && currentActiveSessionData && (
              <div className="surface-card rounded-2xl p-5 border border-blue-200/70">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[17px] font-bold text-black flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-ios-blue animate-pulse" />
                    正在处理
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium px-2 py-1 bg-blue-50 text-ios-blue rounded-md">
                      进行中
                    </span>
                    <button
                      type="button"
                      onClick={handleStopSession}
                      disabled={isStopping}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 text-xs font-semibold transition-colors"
                    >
                      {isStopping ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-red-200 border-t-red-600 animate-spin" />
                      ) : (
                        <Square className="w-3.5 h-3.5 fill-current" />
                      )}
                      停止任务
                    </button>
                  </div>
                </div>

                {(() => {
                  const session = currentActiveSessionData;
                  const getStageName = (stage) => {
                    if (stage === 'polish') return '降低 AIGC 率';
                    if (stage === 'emotion_polish') return '自然表达';
                    if (stage === 'enhance') return '降重';
                    return stage;
                  };
                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-[13px] mb-2 font-medium">
                          <span className="text-ios-gray">
                            当前阶段: <span className="text-black">{getStageName(session.current_stage)}</span>
                          </span>
                          <span className="text-ios-blue">
                            {session.progress.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-ios-blue h-2 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(0,122,255,0.3)]"
                            style={{ width: `${session.progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-ios-gray">
                          进度: <span className="font-medium text-black">{session.current_position + 1}</span> / {session.total_segments} 段
                        </span>

                        {session.status === 'queued' && queueStatus?.your_position && (
                          <div className="flex items-center gap-1.5 text-ios-orange">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              排队第 {queueStatus.your_position} 位
                              (~{Math.ceil(queueStatus.estimated_wait_time / 60)}分)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 右侧 - 历史会话 */}
          <div className="space-y-6">
            <div className="surface-card rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-96px)] lg:sticky lg:top-20">
              <div className="p-4 border-b border-slate-100/80 bg-white/45 backdrop-blur-sm z-10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-slate-500" />
                    <h2 className="text-[19px] font-bold text-slate-900 tracking-tight">
                      历史记录
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                    {filteredSessions.length}
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={sessionSearch}
                    onChange={(event) => setSessionSearch(event.target.value)}
                    placeholder="搜索文件名或内容"
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-100/80 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition-all"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100/80">
                  {[
                    ['all', '全部'],
                    ['active', '进行中'],
                    ['completed', '完成'],
                    ['failed', '失败'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSessionFilter(value)}
                      className={`py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                        sessionFilter === value
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar h-full">
                {isLoadingSessions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-ios-gray/30 border-t-ios-gray rounded-full animate-spin" />
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
                      <History className="w-6 h-6" />
                    </div>
                    <p className="text-ios-gray text-sm">
                      {sessions.length === 0 ? '暂无会话记录' : '没有匹配的会话'}
                    </p>
                  </div>
                ) : (
                  filteredSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      activeSession={activeSession}
                      onView={handleViewSession}
                      onDelete={handleDeleteSession}
                      onRetry={handleRetrySegment}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
