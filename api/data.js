import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';
import { loadWeekData, canUseBlob } from '../lib/datastore.js';

/* 주간 데이터 제공. 로그인한 사용자만.
   Blob에 최신본이 있으면 그것을, 없으면 배포에 포함된 사본을 준다. */
export default async function handler(req, res) {
  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });

  res.setHeader('Cache-Control', 'private, no-store');
  if (canUseBlob()) {
    try {
      const data = await loadWeekData();
      if (data) return res.status(200).json(data);
    } catch (e) {
      console.error('Blob 데이터 조회 실패, 번들 사본으로 대체:', e.message);
    }
  }
  const { default: fallback } = await import('../public/data.json', { with: { type: 'json' } });
  return res.status(200).json(fallback);
}
