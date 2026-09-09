import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';
import { loadWeekData, canUseBlob } from '../lib/datastore.js';

/* 주간 데이터 제공. 로그인한 사용자만.
   Blob에 최신본이 있으면 그것을, 없으면 배포에 포함된 사본을 준다. */
export default async function handler(req, res) {
  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });

  res.setHeader('Cache-Control', 'private, no-store');

  const { default: bundled } = await import('../public/data.json', { with: { type: 'json' } });
  if (!canUseBlob()) return res.status(200).json(bundled);

  let blob = null;
  try {
    blob = await loadWeekData();
  } catch (e) {
    console.error('Blob 데이터 조회 실패, 번들 사본으로 대체:', e.message);
  }
  if (!blob) return res.status(200).json(bundled);

  // 둘 중 더 나중에 만들어진 쪽을 준다. 예전에는 Blob을 무조건 먼저 썼는데,
  // 그 사이 새로 배포한 사본이 더 최신이어도 오래된 Blob에 가려졌다.
  const at = x => Date.parse(x?.generatedAt || 0) || 0;
  return res.status(200).json(at(bundled) > at(blob) ? bundled : blob);
}
