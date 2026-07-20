import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight, CheckCircle, FileText, KeyRound, LayoutTemplate, Shield, Sparkles,
} from 'lucide-react';
import { authAPI, healthAPI, requestWithFallback } from '../api';

const WelcomePage = () => {
  const { cardKey: routeCardKey } = useParams();
  const [mode, setMode] = useState(routeCardKey ? 'card' : 'account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cardKey, setCardKey] = useState(routeCardKey || '');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    healthAPI.checkModels().catch(() => {});
  }, []);

  const enterWorkspace = useCallback((key) => {
    localStorage.setItem('cardKey', key);
    navigate('/workspace');
  }, [navigate]);

  const verifyCardKey = useCallback(async (key, showErrors = true) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      if (showErrors) toast.error('请输入访问卡密');
      return;
    }

    setLoading(true);
    try {
      const response = await requestWithFallback('post', '/admin/verify-card-key', {
        card_key: normalizedKey,
      });
      if (response.data.valid) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        localStorage.removeItem('displayName');
        enterWorkspace(normalizedKey);
      } else if (showErrors) {
        toast.error('卡密验证失败，请检查卡密是否正确');
      }
    } catch (error) {
      if (showErrors) {
        const message = error.code === 'ECONNABORTED'
          ? '验证超时，请确认后端服务已启动'
          : (error.response?.data?.detail || '卡密验证失败，请检查卡密是否正确');
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }, [enterWorkspace]);

  useEffect(() => {
    if (routeCardKey) {
      setCardKey(routeCardKey);
      setMode('card');
      verifyCardKey(routeCardKey, false);
    }
  }, [routeCardKey, verifyCardKey]);

  const handleAccountLogin = async () => {
    if (loading) return;
    if (!username.trim() || !password.trim()) {
      toast.error('请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.login(username.trim(), password);
      const { access_token, display_name, card_key } = response.data;
      localStorage.setItem('authToken', access_token);
      localStorage.setItem('username', username.trim());
      if (display_name) localStorage.setItem('displayName', display_name);
      if (card_key) localStorage.setItem('cardKey', card_key);
      toast.success('登录成功');
      navigate('/workspace');
    } catch (error) {
      toast.error(error.response?.data?.detail || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  const handleCardLogin = async () => {
    if (loading) return;
    await verifyCardKey(cardKey);
  };

  const isAccountMode = mode === 'account';
  const canSubmit = isAccountMode
    ? username.trim() && password.trim()
    : cardKey.trim();

  return (
    <div className="min-h-screen bg-app-shell flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute top-[-14rem] left-[-10rem] w-[34rem] h-[34rem] rounded-full bg-blue-300/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-18rem] right-[-12rem] w-[38rem] h-[38rem] rounded-full bg-violet-300/20 blur-3xl pointer-events-none" />
      <button
        onClick={() => navigate('/admin')}
        className="fixed top-6 left-6 px-4 py-2.5 surface-card-soft hover:bg-white/90 text-slate-700 rounded-2xl transition-all active:scale-95 flex items-center gap-2 text-sm font-medium z-10"
      >
        <Shield className="w-4 h-4 text-blue-600" />
        管理后台
      </button>

      <div className="max-w-6xl w-full grid lg:grid-cols-[1.15fr_0.85fr] items-stretch gap-5 relative z-[1]">
        <section className="hidden lg:flex rounded-[32px] bg-slate-950 text-white p-10 flex-col justify-between relative overflow-hidden shadow-2xl shadow-slate-900/20 animate-fade-in-up">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.5),transparent_28rem),radial-gradient(circle_at_90%_90%,rgba(124,58,237,0.38),transparent_24rem)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs text-blue-100">
              <Sparkles className="w-3.5 h-3.5" />
              AI 学术生产力套件
            </div>
            <h1 className="text-5xl font-bold tracking-tight leading-[1.12] mt-7">
              让写作、排版与检查
              <span className="block text-blue-300 mt-2">汇聚在一个工作台。</span>
            </h1>
            <p className="text-slate-300 text-base leading-relaxed mt-5 max-w-xl">
              支持文本与多种文档格式，在保留结构的同时完成语言优化、规范排版和质量检查。
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3 mt-12">
            {[
              { icon: FileText, title: '多格式输入', text: 'Word / PDF / Markdown' },
              { icon: LayoutTemplate, title: '保留结构', text: '标题、表格与公式' },
              { icon: CheckCircle, title: '完整工作流', text: '优化、检查与导出' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-white/[0.08] border border-white/10 p-4">
                <Icon className="w-5 h-5 text-blue-300 mb-4" />
                <div className="font-semibold text-sm">{title}</div>
                <div className="text-[11px] text-slate-400 mt-1">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="surface-card rounded-[32px] p-7 sm:p-9 space-y-7 animate-fade-in-up">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-violet-600 rounded-[20px] shadow-xl shadow-blue-500/20 mb-1">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gradient tracking-tight">
                AI 学术写作助手
              </h1>
              <p className="text-ios-gray text-sm mt-1">
                降低 AIGC 率 · 智能文本优化
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMode('account')}
              className={`py-2 rounded-lg text-sm font-medium transition-all ${isAccountMode ? 'bg-white text-black shadow-sm' : 'text-ios-gray hover:text-black'}`}
            >
              账号登录
            </button>
            <button
              type="button"
              onClick={() => setMode('card')}
              className={`py-2 rounded-lg text-sm font-medium transition-all ${!isAccountMode ? 'bg-white text-black shadow-sm' : 'text-ios-gray hover:text-black'}`}
            >
              卡密登录
            </button>
          </div>

          {isAccountMode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ios-gray ml-1">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && password.trim() && handleAccountLogin()}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  className="w-full px-4 py-3.5 bg-white/50 backdrop-blur-sm rounded-xl border border-gray-200/50 focus:bg-white/70 focus:ring-2 focus:ring-ios-blue/30 focus:border-ios-blue/50 transition-all text-black placeholder-gray-400 outline-none text-[17px]"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ios-gray ml-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAccountLogin()}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className="w-full px-4 py-3.5 bg-white/50 backdrop-blur-sm rounded-xl border border-gray-200/50 focus:bg-white/70 focus:ring-2 focus:ring-ios-blue/30 focus:border-ios-blue/50 transition-all text-black placeholder-gray-400 outline-none text-[17px]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ios-gray ml-1">访问卡密</label>
              <div className="relative">
                <KeyRound className="w-5 h-5 text-ios-gray absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cardKey}
                  onChange={(e) => setCardKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCardLogin()}
                  placeholder="请输入访问卡密"
                  className="w-full pl-12 pr-4 py-3.5 bg-white/50 backdrop-blur-sm rounded-xl border border-gray-200/50 focus:bg-white/70 focus:ring-2 focus:ring-ios-blue/30 focus:border-ios-blue/50 transition-all text-black placeholder-gray-400 outline-none text-[17px]"
                />
              </div>
            </div>
          )}

          <button
            onClick={isAccountMode ? handleAccountLogin : handleCardLogin}
            disabled={loading || !canSubmit}
            className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-[17px] shadow-lg shadow-blue-500/20 hover:shadow-xl"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                验证中...
              </>
            ) : (
              <>
                登录
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <div className="text-center pt-2">
            <p className="text-xs text-ios-gray">
              使用本系统即表示您同意遵守学术诚信规范
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
