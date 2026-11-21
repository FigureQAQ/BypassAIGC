export function formatElapsed(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 1) return '不到 1 秒';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const remainingSeconds = total % 60;
  return [hours && `${hours} 小时`, minutes && `${minutes} 分`, `${remainingSeconds} 秒`]
    .filter(Boolean)
    .join(' ');
}
