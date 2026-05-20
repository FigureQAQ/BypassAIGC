import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, KeyRound, Shield } from 'lucide-react';
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

  useEffect(() => {
    if (routeCardKey) {
      setCardKey(routeCardKey);
      setMode('card');
    }
  }, [routeCardKey]);

  const enterWorkspace = (key) => {
    localStorage.setItem('cardKey', key);
    navigate('/workspace');
  };

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
    if (!cardKey.trim()) {
      toast.error('请输入访问卡密');
      return;
    }

    setLoading(true);
    try {
      const response = await requestWithFallback('post', '/admin/verify-card-key', {
        card_key: cardKey.trim(),
      });
      if (response.data.valid) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        localStorage.removeItem('displayName');
        enterWorkspace(cardKey.trim());
      } else {
        toast.error('卡密验证失败，请检查卡密是否正确');
      }
    } catch (error) {
      const message = error.code === 'ECONNABORTED'
        ? '验证超时，请确认后端服务已启动'
        : (error.response?.data?.detail || '卡密验证失败，请检查卡密是否正确');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const isAccountMode = mode === 'account';
  const canSubmit = isAccountMode
    ? username.trim() && password.trim()
    : cardKey.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <button
        onClick={() => navigate('/admin')}
        className="fixed top-6 left-6 px-4 py-2.5 bg-white/70 backdrop-blur-xl border border-white/20 shadow-lg hover:bg-white/80 text-gray-800 rounded-2xl transition-all active:scale-95 flex items-center gap-2 text-sm font-medium z-10"
      >
        <Shield className="w-4 h-4 text-blue-600" />
        管理后台
      </button>

      <div className="max-w-md w-full space-y-8">
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 p-8 space-y-8 animate-fade-in-up">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-ios-blue rounded-[22px] shadow-lg mb-2">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-black tracking-tight">
                AI 学术写作助手
              </h1>
              <p className="text-ios-gray text-sm mt-1">
                专业论文润色 · 智能语言优化
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
            className="w-full bg-ios-blue hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-[17px] shadow-lg hover:shadow-xl"
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
