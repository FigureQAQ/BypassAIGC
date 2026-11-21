import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Activity,
  RefreshCw,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  Loader2,
  Play,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getSavedModel, optimizationAPI, wordFormatterAPI } from '../api';
import { formatElapsed } from '../formatElapsed';
import ThemeToggle from '../ThemeToggle';

const MODES = [
  { id: 'paper_polish', title: '降低 AIGC 率', description: '降低机器生成痕迹，保持原意与结构。', accent: 'blue' },
  { id: 'paper_enhance', title: '降低重复率', description: '重组表达，减少重复与相似表述。', accent: 'violet' },
  { id: 'paper_polish_enhance', title: 'AIGC 率 + 重复率', description: '同时处理两项指标，适合论文和长文。', accent: 'cyan', recommended: true },
  { id: 'emotion_polish', title: '仅润色', description: '优化语句、语气和阅读流畅度。', accent: 'amber' },
];

const getSavedConfig = () => ({
  apiKey: localStorage.getItem('userApiKey') || '',
  baseUrl: localStorage.getItem('userBaseUrl') || 'https://api.deepseek.com',
  model: getSavedModel(),
});

const getSavedMode = () => localStorage.getItem('processingMode') || 'paper_polish_enhance';

const errorText = (error) => error?.response?.data?.detail || error?.message || '请求失败，请检查网络和 API 配置';

const statusText = (status) => ({
  completed: '已完成',
  processing: '处理中',
  queued: '排队中',
  failed: '失败',
  stopped: '已停止',
}[status] || status || '未知');

function WorkspacePage({ theme, onToggleTheme }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const connectionTest = useRef(null);
  const [inputMode, setInputMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [processingMode, setProcessingMode] = useState(getSavedMode);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [progress, setProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(() => (
    !getSavedConfig().apiKey.trim() && !localStorage.getItem('apiReminderSeenV2')
  ));
  const [showKey, setShowKey] = useState(false);
  const [config, setConfig] = useState(getSavedConfig);
  const [apiStatus, setApiStatus] = useState(() => (
    localStorage.getItem('validatedApiConfig') === JSON.stringify(getSavedConfig()) ? 'success' : 'idle'
  ));
  const [models, setModels] = useState([]);
  const [modelStatus, setModelStatus] = useState('idle');
  const [modelError, setModelError] = useState('');
  const [modelRefresh, setModelRefresh] = useState(0);
  const apiKey = config.apiKey.trim();
  const baseUrl = config.baseUrl.trim();
  const [historySearch, setHistorySearch] = useState('');

  const updateConfig = (patch) => {
    connectionTest.current?.abort();
    const nextConfig = { ...config, ...patch };
    setApiStatus(localStorage.getItem('validatedApiConfig') === JSON.stringify(nextConfig) ? 'success' : 'idle');
    setConfig(nextConfig);
    localStorage.setItem('userApiKey', nextConfig.apiKey);
    localStorage.setItem('userBaseUrl', nextConfig.baseUrl);
    localStorage.setItem('userModel', nextConfig.model);
  };

  const loadSessions = useCallback(async () => {
    try {
      const response = await optimizationAPI.listSessions();
      setSessions(response.data?.sessions || response.data || []);
    } catch (error) {
      console.warn('加载历史记录失败', error);
    }
  }, []);

  const checkApi = async () => {
    connectionTest.current?.abort();
    const controller = new AbortController();
    connectionTest.current = controller;
    setApiStatus('testing');
    try {
      const { data } = await wordFormatterAPI.testPreprocessConnection({
        api_key: apiKey,
        base_url: baseUrl,
        model: config.model.trim(),
      }, controller.signal);
      if (controller.signal.aborted) return;
      if (!data.success) throw new Error('所选模型未返回文本');
      setApiStatus('success');
      localStorage.setItem('validatedApiConfig', JSON.stringify(config));
      localStorage.setItem('apiReminderSeenV2', '1');
      toast.success('模型连接成功');
    } catch (error) {
      if (controller.signal.aborted) return;
      setApiStatus('error');
      toast.error(`API 连接失败：${errorText(error)}`);
    }
  };

  useEffect(() => {
    loadSessions();
    return () => connectionTest.current?.abort();
  }, [loadSessions]);

  useEffect(() => {
    setModels([]);
    setModelError('');
    if (!apiKey || !baseUrl) {
      setModelStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    setModelStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await wordFormatterAPI.listModels({ api_key: apiKey, base_url: baseUrl }, controller.signal);
        if (controller.signal.aborted) return;
        setModels(data);
        setModelStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setModelError(errorText(error));
        setModelStatus('error');
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiKey, baseUrl, modelRefresh]);

  useEffect(() => {
    if (!activeSession) return undefined;

    let disposed = false;
    let timer;
    const pollProgress = async () => {
      try {
        const { data: next } = await optimizationAPI.getSessionProgress(activeSession);
        if (disposed) return;
        setProgress(next);
        if (['completed', 'failed', 'stopped'].includes(next.status)) {
          setActiveSession(null);
          if (next.status === 'failed') {
            toast.error(next.error_message || '处理失败，请查看任务详情');
          }
          await loadSessions();
          return;
        }
      } catch (error) {
        if (!disposed) console.warn('获取任务进度失败', error);
      }
      if (!disposed) timer = window.setTimeout(pollProgress, 1500);
    };

    pollProgress();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [activeSession, loadSessions]);

  const submit = async () => {
    if (!config.apiKey.trim()) {
      toast.error('请先输入 API Key');
      return;
    }
    if (!baseUrl || !config.model.trim()) {
      toast.error('请填写 Base URL 和模型');
      return;
    }
    if (inputMode === 'text' && !text.trim()) {
      toast.error('请输入要处理的文本');
      return;
    }
    if (inputMode === 'file' && !file) {
      toast.error('请选择要处理的文档');
      return;
    }
    setSubmitting(true);
    try {
      const modelConfig = {
        api_key: config.apiKey,
        base_url: config.baseUrl,
        model: config.model,
      };
      const response = inputMode === 'file'
        ? await optimizationAPI.startOptimizationFile(file, {
            processing_mode: processingMode,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
          })
        : await optimizationAPI.startOptimization({
            original_text: text,
            processing_mode: processingMode,
            polish_config: modelConfig,
            enhance_config: modelConfig,
            emotion_config: modelConfig,
          });
      const sessionId = response.data.session_id;
      setActiveSession(sessionId);
      setProgress(response.data);
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadSessions();
      toast.success('任务已开始处理');
    } catch (error) {
      toast.error(`启动失败：${errorText(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const stop = async () => {
    if (!activeSession) return;
    setStopping(true);
    try {
      await optimizationAPI.stopSession(activeSession);
      setProgress((current) => ({ ...current, status: 'stopped', elapsed_seconds: null }));
      setActiveSession(null);
      await loadSessions();
      toast.success('任务已停止');
    } catch (error) {
      toast.error(`停止失败：${errorText(error)}`);
    } finally {
      setStopping(false);
    }
  };

  const selectFile = (selected) => {
    if (!selected) return;
    const allowed = /\.(txt|md|markdown|docx|pdf)$/i.test(selected.name);
    if (!allowed) {
      toast.error('支持 TXT、Markdown、DOCX 和 PDF 文件');
      return;
    }
    setFile(selected);
    setInputMode('file');
  };

  const onFileDragEnter = (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDraggingFile(true);
  };

  const onFileDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDraggingFile(false);
  };

  const onFileDragOver = (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onFileDrop = (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDraggingFile(false);
    const { files } = event.dataTransfer;
    if (files.length !== 1) {
      toast.error('请一次拖入一个文件');
      return;
    }
    selectFile(files[0]);
  };

  const deleteSession = async (session) => {
    if (!window.confirm('确定删除这条历史记录及其结果吗？')) return;
    try {
      await optimizationAPI.deleteSession(session.session_id);
      await loadSessions();
    } catch (error) {
      toast.error(`删除失败：${errorText(error)}`);
    }
  };

  const visibleSessions = sessions.filter((session) => {
    const keyword = historySearch.trim().toLowerCase();
    return !keyword || [session.source_filename, session.preview_text, session.session_id]
      .some((value) => String(value || '').toLowerCase().includes(keyword));
  }).slice(0, 8);

  const rawProgress = Number(progress?.progress || 0);
  const percent = Math.floor(Math.max(0, Math.min(100, rawProgress)));
  const elapsed = formatElapsed(progress?.elapsed_seconds);
  const totalSegments = progress?.total_segments || 0;
  const processedSegments = progress?.status === 'completed'
    ? totalSegments
    : Math.min(progress?.current_position || 0, totalSegments);

  return (
    <main className="workspace-shell">
      <div className="workspace-disclaimer">
        本工具仅用于文本表达辅助与格式整理，处理结果请自行审核并承担最终使用责任。
      </div>
      <header className="workspace-header">
        <div className="workspace-brand">
          <div className="workspace-logo"><Sparkles size={18} /></div>
          <div><strong>BypassAIGC</strong><span>AI 文本工作台</span></div>
        </div>
        <div className="workspace-header-actions">
          <div className={`api-badge ${apiStatus === 'success' ? 'is-connected' : ''}`}>
            <span className="api-dot" />
            {apiStatus === 'testing' ? '正在测试 API' : apiStatus === 'success' ? 'API 已连接' : apiStatus === 'error' ? '连接失败' : apiKey ? 'API 已配置' : 'API 未配置'}
          </div>
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
          <button type="button" className="icon-button" onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced} aria-controls="workspace-api-config" aria-label="API 配置" title="API 配置">
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      {showAdvanced && <div className="api-settings"><section className="api-panel api-popover" id="workspace-api-config">
        <div className="panel-title"><KeyRound size={17} /><strong>API 配置</strong></div>
        <div className="api-fields">
          <label className="api-key-field"><span>API Key</span><div><input type={showKey ? 'text' : 'password'} value={config.apiKey} onChange={(event) => updateConfig({ apiKey: event.target.value })} placeholder="请输入 API Key" /><button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          <label className="api-base-field"><span>Base URL</span><input value={config.baseUrl} onChange={(event) => updateConfig({ baseUrl: event.target.value })} placeholder="https://api.deepseek.com" /></label>
          {models.length > 0 && (
            <label className="api-model-picker">
              <span>可用模型</span>
              <select value={models.includes(config.model) ? config.model : ''} onChange={(event) => updateConfig({ model: event.target.value })}>
                <option value="" disabled>从列表选择模型</option>
                {models.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
          )}
          <label><span>模型名称</span><input value={config.model} onChange={(event) => updateConfig({ model: event.target.value })} placeholder="输入模型名称" /></label>
          <button type="button" className="test-api-button model-refresh-button" onClick={() => setModelRefresh((value) => value + 1)} disabled={!apiKey || !baseUrl || modelStatus === 'loading'}>
            {modelStatus === 'loading' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}刷新模型
          </button>
          <div className="model-list-status" role="status">
            {modelStatus === 'loading' && '正在获取模型列表…'}
            {modelStatus === 'ready' && (models.length ? `已获取 ${models.length} 个模型，可从列表选择或手动填写。` : '服务返回了空列表，请手动填写模型。')}
            {modelStatus === 'error' && modelError}
          </div>
          <button type="button" className="test-api-button" onClick={checkApi} disabled={!apiKey || !baseUrl || !config.model.trim() || apiStatus === 'testing'}>
            {apiStatus === 'testing' ? <Loader2 className="spin" size={16} /> : <Activity size={16} />}{apiStatus === 'success' ? '重新测试' : '测试连接'}
          </button>
        </div>
      </section></div>}

      <section className="workspace-hero">
        <div>
          <p className="eyebrow">SMART WRITING WORKSPACE</p>
          <h1>让每一段文字，<span>更自然。</span></h1>
          <p className="hero-copy">输入 API Key 后即可开始。上传文档或粘贴文本，选择处理目标，剩下的交给工作台。</p>
        </div>
        <div className="hero-orb"><Sparkles size={30} /></div>
      </section>

      <div className="workspace-grid">
        <section
          className={`editor-panel ${draggingFile ? 'is-dragging-file' : ''}`}
          onDragEnter={onFileDragEnter}
          onDragOver={onFileDragOver}
          onDragLeave={onFileDragLeave}
          onDrop={onFileDrop}
        >
          <div className="section-heading"><div><p className="eyebrow">STEP 01</p><h2>选择处理方式</h2></div><span className="muted-label">选择一个目标</span></div>
          <div className="mode-grid">{MODES.map((mode) => <button key={mode.id} className={`mode-card ${processingMode === mode.id ? 'selected' : ''} accent-${mode.accent}`} onClick={() => { setProcessingMode(mode.id); localStorage.setItem('processingMode', mode.id); }}><span className="mode-check">{processingMode === mode.id && <Check size={13} />}</span><strong>{mode.title}</strong><small>{mode.description}</small>{mode.recommended && <em>推荐</em>}</button>)}</div>

          <div className="section-heading input-heading"><div><p className="eyebrow">STEP 02</p><h2>添加内容</h2></div><div className="input-tabs"><button className={inputMode === 'text' ? 'active' : ''} onClick={() => setInputMode('text')}>粘贴文本</button><button className={inputMode === 'file' ? 'active' : ''} onClick={() => setInputMode('file')}>上传文档</button></div></div>
          {inputMode === 'text' ? (
            <textarea className="text-editor" value={text} onChange={(event) => setText(event.target.value)} placeholder="在这里粘贴或输入文章内容…" />
          ) : (
            <div className={`drop-zone ${file ? 'has-file' : ''}`}>
              <input ref={fileInputRef} type="file" hidden accept=".txt,.md,.markdown,.docx,.pdf" onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = '';
              }} />
              <button type="button" className="choose-file" onClick={() => fileInputRef.current?.click()}>
                {file ? <FileText size={32} /> : <Upload size={30} />}
                <strong>{file ? file.name : '拖拽文件到这里，或点此上传'}</strong>
                <span>{file ? `${(file.size / 1024).toFixed(1)} KB · 点击更换文件` : '支持 TXT、Markdown、DOCX、PDF'}</span>
              </button>
              {file && <button type="button" className="remove-file" onClick={() => setFile(null)}><X size={15} />移除</button>}
            </div>
          )}
          <div className="editor-footer"><span>{inputMode === 'text' ? `${text.length.toLocaleString()} 字 · 可拖入文档` : file ? '已选择 1 个文件' : '尚未选择文件'}</span><div>{activeSession && <button className="stop-button" onClick={stop} disabled={stopping}><Square size={14} />{stopping ? '停止中' : '停止任务'}</button>}<button className="start-button" onClick={submit} disabled={submitting || Boolean(activeSession)}>{submitting ? <Loader2 className="spin" size={17} /> : <Play size={17} fill="currentColor" />}{submitting ? '正在启动…' : activeSession ? '任务处理中' : '开始处理'}</button></div></div>

          {progress && <div className={`progress-card ${progress.status === 'failed' ? 'is-failed' : ''}`}><div className="progress-top"><div><strong>当前任务</strong><span>{progress.current_stage || statusText(progress.status)}</span></div><b>{percent}%</b></div><div className="progress-track"><i style={{ width: `${percent}%` }} /></div><div className="progress-meta"><span><Clock3 size={14} />{statusText(progress.status)}</span>{elapsed && <span>{progress.status === 'completed' ? '共用时' : '已用时'} {elapsed}</span>}<span>{processedSegments}/{totalSegments || '—'} 段</span></div>{progress.status === 'failed' && (progress.error_message || progress.error) && <p className="progress-error">{progress.error_message || progress.error}</p>}</div>}
        </section>

        <aside className="history-panel"><div className="section-heading"><div><p className="eyebrow">RECENT</p><h2><History size={20} />历史记录</h2></div><span className="history-count">{sessions.length}</span></div><div className="history-search"><Search size={15} /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="搜索历史记录" /></div><div className="history-list">{visibleSessions.length ? visibleSessions.map((session) => <div className={`history-item ${activeSession === session.session_id ? 'active' : ''}`} key={session.session_id} onClick={() => navigate(`/session/${session.session_id}`)}><div className="history-icon">{session.status === 'completed' ? <CheckCircle2 size={17} /> : <FileText size={17} />}</div><div className="history-content"><strong>{session.source_filename || '文本任务'}</strong><span>{statusText(session.status)} · {session.created_at ? new Date(session.created_at).toLocaleDateString() : '刚刚'}</span>{session.status === 'completed' && formatElapsed(session.elapsed_seconds) && <span>用时 {formatElapsed(session.elapsed_seconds)}</span>}</div><button onClick={(event) => { event.stopPropagation(); deleteSession(session); }} title="删除"><Trash2 size={15} /></button></div>) : <div className="empty-history"><History size={28} /><span>还没有处理记录</span><small>完成一次处理后，记录会显示在这里</small></div>}</div></aside>
      </div>
    </main>
  );
}

export default WorkspacePage;
