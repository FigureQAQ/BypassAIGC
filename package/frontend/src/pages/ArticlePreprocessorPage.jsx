import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, FileText, Upload, Play, Download,
  CheckCircle, AlertCircle, Loader2, Settings, Eye, Edit3,
  RefreshCw, FileUp, X, ChevronDown, ChevronUp,
  Hash, Type, List, BookOpen, Quote, Table, Image, Code
} from 'lucide-react';
import { wordFormatterAPI } from '../api';

// Paragraph type configuration with icons and colors
const PARAGRAPH_TYPES = {
  title: { label: 'Title', icon: Type, color: 'bg-blue-100 text-blue-700 border-blue-300' },
  heading1: { label: 'Heading 1', icon: Hash, color: 'bg-blue-100 text-blue-700 border-blue-300' },
  heading2: { label: 'Heading 2', icon: Hash, color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  heading3: { label: 'Heading 3', icon: Hash, color: 'bg-teal-100 text-teal-700 border-teal-300' },
  abstract: { label: 'Abstract', icon: BookOpen, color: 'bg-amber-100 text-amber-700 border-amber-300' },
  keywords: { label: 'Keywords', icon: List, color: 'bg-orange-100 text-orange-700 border-orange-300' },
  body: { label: 'Body', icon: FileText, color: 'bg-gray-100 text-gray-700 border-gray-300' },
  quote: { label: 'Quote', icon: Quote, color: 'bg-blue-100 text-blue-700 border-blue-300' },
  list_item: { label: 'List item', icon: List, color: 'bg-green-100 text-green-700 border-green-300' },
  table: { label: 'Table', icon: Table, color: 'bg-pink-100 text-pink-700 border-pink-300' },
  figure: { label: 'Figure', icon: Image, color: 'bg-rose-100 text-rose-700 border-rose-300' },
  code: { label: 'Code', icon: Code, color: 'bg-slate-100 text-slate-700 border-slate-300' },
  reference: { label: 'Reference', icon: BookOpen, color: 'bg-teal-100 text-teal-700 border-teal-300' },
};

const ArticlePreprocessorPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const mountedRef = useRef(false);

  // Input mode and content
  const [inputMode, setInputMode] = useState('file'); // 'file' or 'text'
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Configuration
  const [showConfig, setShowConfig] = useState(false);
  const [chunkParagraphs, setChunkParagraphs] = useState(40);
  const [chunkChars, setChunkChars] = useState(8000);

  // Job state
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // 'pending', 'running', 'completed', 'failed'
  const [progress, setProgress] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Result state
  const [paragraphs, setParagraphs] = useState([]);
  const [markedText, setMarkedText] = useState('');
  const [integrityStatus, setIntegrityStatus] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);

  // View mode
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'raw'
  const [usage, setUsage] = useState(null);

  // Check if coming from spec generator with a spec
  const selectedSpec = location.state?.specJson || null;
  const specName = location.state?.specName || null;

  useEffect(() => {
    mountedRef.current = true;
    loadUsage();
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const loadUsage = async () => {
    try {
      const response = await wordFormatterAPI.getUsage();
      setUsage(response.data);
    } catch (error) {
      console.error('Load usage failed:', error);
    }
  };

  // File handling
  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExtensions = ['.txt', '.md', '.docx'];
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

    if (!allowedTypes.includes(selectedFile.type) && !allowedExtensions.includes(ext)) {
      toast.error('浠呮敮??.txt, .md, .docx 鏂囦欢');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('鏂囦欢澶у皬涓嶈兘瓒呰繃 10MB');
      return;
    }

    setFile(selectedFile);
    toast.success(`宸查€夋嫨鏂囦欢: ${selectedFile.name}`);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Start preprocessing
  const handleStartPreprocess = async () => {
    if (inputMode === 'file' && !file) {
      toast.error('璇烽€夋嫨鏂囦欢');
      return;
    }
    if (inputMode === 'text' && !text.trim()) {
      toast.error('Please enter text content');
      return;
    }

    try {
      setIsSubmitting(true);
      setJobStatus('pending');
      setParagraphs([]);
      setMarkedText('');
      setIntegrityStatus(null);

      let response;
      if (inputMode === 'file') {
        response = await wordFormatterAPI.preprocessFile(file, {
          chunkParagraphs,
          chunkChars,
        });
      } else {
        response = await wordFormatterAPI.preprocessText(text, {
          chunkParagraphs,
          chunkChars,
        });
      }

      const jobId = response.data.job_id;
      setCurrentJobId(jobId);
      startSSE(jobId);
      toast.success('Preprocess task started');
    } catch (error) {
      console.error('Start preprocess failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to start preprocess');
      setJobStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // SSE connection
  const startSSE = (jobId) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = wordFormatterAPI.getPreprocessStreamUrl(jobId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (eventSourceRef.current !== es) return;
      try {
        const data = JSON.parse(event.data);
        handleSSEData(data);
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    es.addEventListener('progress', (event) => {
      if (eventSourceRef.current !== es) return;
      try {
        const data = JSON.parse(event.data);
        setJobStatus('running');
        setProgress(data);
      } catch (e) {
        console.error('SSE progress error:', e);
      }
    });

    es.addEventListener('completed', (event) => {
      if (eventSourceRef.current !== es) return;
      try {
        JSON.parse(event.data);
        setJobStatus('completed');
        fetchResult(jobId);
        toast.success('鏂囩珷棰勫鐞嗗畬鎴愶紒');
        loadUsage();
      } catch (e) {
        console.error('SSE completed error:', e);
      }
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }
      es.close();
    });

    es.addEventListener('error', (event) => {
      if (eventSourceRef.current !== es) return;
      try {
        const data = JSON.parse(event.data);
        setJobStatus('failed');
        toast.error(`棰勫鐞嗗け?? ${data.message}`);
      } catch (e) {
        console.error('SSE error event:', e);
      }
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }
      es.close();
    });

    es.onerror = () => {
      if (eventSourceRef.current !== es) return;
      if (es.readyState === EventSource.CLOSED) {
        return;
      }
      console.log('SSE connection error, will retry fetching result...');
      es.close();
      eventSourceRef.current = null;
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        if (mountedRef.current) {
          fetchResult(jobId);
        }
      }, 2000);
    };
  };

  const handleSSEData = (data) => {
    if (data.status) {
      setJobStatus(data.status);
    }
    if (data.progress) {
      setProgress(data);
    }
  };

  // Fetch preprocessing result
  const fetchResult = async (jobId) => {
    try {
      const response = await wordFormatterAPI.getPreprocessResult(jobId);
      if (response.data.success) {
        // 鍚庣鐩存帴杩斿洖 response.data锛屾棤闇€ .result
        // 瀛楁鏄犲皠锛氬悗??text/paragraph_type -> 鍓嶇 content/type
        const paragraphsData = (response.data.paragraphs || []).map((p) => ({
          index: p.index,
          content: p.text,
          type: p.paragraph_type || 'body',
        }));
        setParagraphs(paragraphsData);
        setMarkedText(response.data.marked_text || '');
        setIntegrityStatus({
          verified: response.data.integrity_check_passed,
          originalHash: response.data.original_hash,
          processedHash: response.data.processed_hash,
        });
        setJobStatus('completed');
      } else {
        // 浠诲姟澶辫触
        setJobStatus('failed');
        toast.error(response.data.error || 'Preprocess failed');
      }
    } catch (error) {
      console.error('Fetch result failed:', error);
      const status = error.response?.status;
      if (status === 404) {
        toast.error('Task not found or expired');
        setJobStatus(null);
      } else if (status === 400) {
        console.log('Task is still running; retry later');
      } else {
        // 鍏朵粬閿欒
        console.error('鑾峰彇缁撴灉澶辫触:', error.response?.data?.detail || error.message);
      }
    }
  };

  // Edit paragraph type
  const handleTypeChange = (index, newType) => {
    const updated = [...paragraphs];
    updated[index] = { ...updated[index], type: newType };
    setParagraphs(updated);
    setEditingIndex(null);

    // Regenerate marked text
    regenerateMarkedText(updated);
  };

  const regenerateMarkedText = (updatedParagraphs) => {
    const lines = updatedParagraphs.map((p) => {
      return `<!-- wf:type=${p.type} -->\n${p.content}`;
    });
    setMarkedText(lines.join('\n\n'));
  };

  // Export marked text
  const handleExportMarkdown = () => {
    if (!markedText) {
      toast.error('娌℃湁鍙鍑虹殑鍐呭');
      return;
    }

    const blob = new Blob([markedText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file?.name?.replace(/\.[^.]+$/, '_marked.md') || 'article_marked.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Markdown exported');
  };

  // Navigate to format page
  const handleGoToFormat = () => {
    if (!markedText) {
      toast.error('Please complete preprocessing first');
      return;
    }

    navigate('/word-formatter', {
      state: {
        preprocessedText: markedText,
        specJson: selectedSpec,
        specName: specName,
      },
    });
  };

  // Reset form
  const handleReset = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setFile(null);
    setText('');
    setCurrentJobId(null);
    setJobStatus(null);
    setProgress(null);
    setParagraphs([]);
    setMarkedText('');
    setIntegrityStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Delete current job
  const handleDeleteJob = async () => {
    if (!currentJobId) return;

    try {
      await wordFormatterAPI.deletePreprocessJob(currentJobId);
      handleReset();
      toast.success('Task deleted');
    } catch (error) {
      console.error('Delete job failed:', error);
      toast.error('鍒犻櫎浠诲姟澶辫触');
    }
  };

  // Render paragraph type badge
  const renderTypeBadge = (type, index) => {
    const config = PARAGRAPH_TYPES[type] || PARAGRAPH_TYPES.body;
    const IconComponent = config.icon;
    const isEditing = editingIndex === index;

    if (isEditing) {
      return (
        <div className="absolute top-0 left-0 z-10 bg-white border rounded-lg shadow-lg p-2 min-w-48">
          <div className="text-xs text-gray-500 mb-1">閫夋嫨娈佃惤绫诲瀷</div>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(PARAGRAPH_TYPES).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => handleTypeChange(index, key)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${cfg.color} hover:opacity-80 transition-opacity`}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setEditingIndex(null)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            鍙栨秷
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => setEditingIndex(index)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${config.color} hover:opacity-80 transition-opacity`}
        title="鐐瑰嚮淇敼绫诲瀷"
      >
        <IconComponent className="w-3 h-3" />
        {config.label}
        <Edit3 className="w-2.5 h-2.5 ml-1 opacity-50" />
      </button>
    );
  };

  // Render progress bar
  const renderProgress = () => {
    // 鍚庣鍙?? { phase, progress (0-1), message, detail }
    // detail 鏍煎紡: "鍒嗗潡 x/y" ??null

    if (!progress) {
      return (
        <div className="bg-white rounded-lg border p-4 mb-4">
          <div className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-gray-700">姝ｅ湪鍒濆鍖栭澶勭悊浠诲姟...</span>
          </div>
        </div>
      );
    }

    const percentage = Math.round((progress.progress || 0) * 100);

    // 瑙ｆ瀽 detail 鑾峰彇鍒嗗潡淇℃伅
    let chunkInfo = '';
    if (progress.detail) {
      chunkInfo = progress.detail;
    }

    const phaseMessages = {
      splitting: 'Splitting article...',
      marking: `Detecting paragraph types${chunkInfo ? ` (${chunkInfo})` : ``}`,
      validating: 'Validating integrity...',
      completed: 'Completed',
      error: 'Error',
    };

    const displayMessage = progress.message || phaseMessages[progress.phase] || 'Processing...';

    return (
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {displayMessage}
          </span>
          <span className="text-sm text-gray-500">{percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/spec-generator"
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">杩斿洖瑙勮寖鐢熸垚</span>
            </Link>
            <div className="h-6 w-px bg-gray-300" />
            <h1 className="text-lg font-semibold text-gray-900">Article Preprocessor</h1>
          </div>

          <div className="flex items-center gap-4">
            {usage && (
              <div className="text-sm text-gray-600">
                Usage: {usage.used}/{usage.limit}
              </div>
            )}
            {selectedSpec && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                <CheckCircle className="w-4 h-4" />
                Selected spec: {specName || 'Custom'}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Workflow indicator */}
        <div className="mb-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <span className="px-3 py-1 bg-gray-100 rounded-full">1. 鐢熸垚瑙勮寖</span>
          <ArrowRight className="w-4 h-4" />
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
            2. 鏂囩珷棰勫??          </span>
          <ArrowRight className="w-4 h-4" />
          <span className="px-3 py-1 bg-gray-100 rounded-full">3. 鐢熸垚 Word</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Input */}
          <div className="space-y-4">
            {/* Input Mode Toggle */}
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => setInputMode('file')}
                  className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                    inputMode === 'file'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-2" />
                  涓婁紶鏂囦欢
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                    inputMode === 'text'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-4 h-4 inline mr-2" />
                  绮樿创鏂囨湰
                </button>
              </div>

              {inputMode === 'file' ? (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.docx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileUp className="w-8 h-8 text-blue-500" />
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{file.name}</div>
                        <div className="text-sm text-gray-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-600 mb-2">鎷栨嫿鏂囦欢鍒拌繖閲岋紝鎴栫偣鍑婚€夋嫨</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        閫夋嫨鏂囦欢
                      </button>
                      <p className="text-sm text-gray-400 mt-2">鏀寔 .txt, .md, .docx (鏈€??10MB)</p>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="鍦ㄦ绮樿创鎮ㄧ殑鏂囩珷鍐呭..."
                  className="w-full h-64 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-lg border">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="w-full px-4 py-3 flex items-center justify-between text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  楂樼骇閰嶇疆
                </span>
                {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showConfig && (
                <div className="px-4 pb-4 space-y-3 border-t">
                  <div className="pt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      姣忓潡鏈€澶ф钀芥暟
                    </label>
                    <input
                      type="number"
                      value={chunkParagraphs}
                      onChange={(e) => setChunkParagraphs(parseInt(e.target.value) || 40)}
                      min={10}
                      max={100}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">寤鸿 30-50锛岃繃澶у彲鑳藉??AI 璇嗗埆涓嶅噯</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      姣忓潡鏈€澶у瓧绗︽暟
                    </label>
                    <input
                      type="number"
                      value={chunkChars}
                      onChange={(e) => setChunkChars(parseInt(e.target.value) || 8000)}
                      min={2000}
                      max={20000}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Recommended: 6000-10000 chars.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleStartPreprocess}
                disabled={isSubmitting || jobStatus === 'running'}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting || jobStatus === 'running' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    澶勭悊??..
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    寮€濮嬮澶勭悊
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                disabled={jobStatus === 'running'}
                className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right Panel - Result */}
          <div className="space-y-4">
            {/* Progress */}
            {(jobStatus === 'running' || jobStatus === 'pending') && renderProgress()}

            {/* Result Header */}
            {jobStatus === 'completed' && paragraphs.length > 0 && (
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900">Preprocess Result</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded ${
                        viewMode === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      title="鍒楄〃瑙嗗浘"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`p-2 rounded ${
                        viewMode === 'raw' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      title="鍘熷鏂囨湰"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Integrity Status */}
                {integrityStatus && (
                  <div
                    className={`flex items-center gap-2 p-2 rounded text-sm mb-4 ${
                      integrityStatus.verified
                        ? 'bg-green-50 text-green-700'
                        : 'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    {integrityStatus.verified ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Integrity check passed
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        Integrity warning
                      </>
                    )}
                  </div>
                )}

                {/* Statistics */}
                <div className="grid grid-cols-3 gap-4 text-center text-sm mb-4">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-2xl font-semibold text-blue-600">{paragraphs.length}</div>
                    <div className="text-gray-500">Paragraphs</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-2xl font-semibold text-blue-600">
                      {paragraphs.filter((p) => p.type.startsWith('heading')).length}
                    </div>
                    <div className="text-gray-500">鏍囬</div>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <div className="text-2xl font-semibold text-green-600">
                      {paragraphs.filter((p) => p.type === 'body').length}
                    </div>
                    <div className="text-gray-500">姝ｆ枃</div>
                  </div>
                </div>

                {/* Content View */}
                <div className="max-h-96 overflow-y-auto border rounded-lg">
                  {viewMode === 'list' ? (
                    <div className="divide-y">
                      {paragraphs.map((para, index) => (
                        <div key={index} className="p-3 hover:bg-gray-50 relative">
                          <div className="flex items-start gap-3">
                            <span className="text-xs text-gray-400 mt-1 w-6">{index + 1}</span>
                            <div className="flex-1">
                              <div className="mb-1">{renderTypeBadge(para.type, index)}</div>
                              <p className="text-sm text-gray-700 line-clamp-2">{para.content}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono">
                      {markedText}
                    </pre>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleExportMarkdown}
                    className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    <Download className="w-4 h-4" />
                    Export Markdown
                  </button>
                  <button
                    onClick={handleGoToFormat}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Next: Generate Word
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!jobStatus && (
              <div className="bg-white rounded-lg border p-8 text-center">
                <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Waiting for preprocessing</h3>
                <p className="text-gray-500 text-sm">
                  Upload a file or paste text, then click the start button.
                  <br />
                  The system will detect and mark paragraph types.
                </p>
              </div>
            )}

            {/* Failed state */}
            {jobStatus === 'failed' && (
              <div className="bg-white rounded-lg border p-8 text-center">
                <AlertCircle className="w-16 h-16 mx-auto text-red-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Preprocess failed</h3>
                <p className="text-gray-500 text-sm mb-4">Please check the file format or network connection, then try again.</p>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Restart
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ArticlePreprocessorPage;
