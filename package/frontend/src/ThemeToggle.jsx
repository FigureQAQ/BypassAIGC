import React from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ theme, onToggleTheme }) {
  const isDark = theme === 'dark';
  const label = isDark ? '切换到日间模式' : '切换到夜间模式';
  return (
    <button type="button" className="icon-button theme-toggle" onClick={onToggleTheme} aria-label={label} title={label}>
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
