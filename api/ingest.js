import { loadWeekData, saveWeekData, canUseBlob } from '../lib/datastore.js';

/* 시트 → 대시보드 즉시 반영.
   Apps Script가 입력된 주차를 그대로 밀어 넣는다. 예전에는 GitHub Action이
   하루 한 번 전체를 다시 만드는 길밖에 없어서, 오늘 넣은 값이 다음 날에야
   보였다. 여기로 들어오면 그 주차만 스냅샷에 얹고 끝난다. */

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEEKS = 12;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const secret = process.env.INGEST_SECRET || '';
  if (!secret) return res.status(500).json({ error: 'server_misconfigured' });

  const given = req.headers['x-ingest-secret'] || req.body?.secret || '';
  // 길이가 달라도 같은 시간을 쓰도록 — 짧은 비밀키를 앞자리부터 맞춰 보는 것을 막는다
  const ok = given.length === secret.length &&
    [...secret].reduce((a, c, i) => a | (c.charCodeAt(0) ^ given.charCodeAt(i)), 0) === 0;
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  if (!canUseBlob()) return res.status(500).json({ error: 'store_unavailable' });

  const incoming = req.body?.data;
  if (!incoming || typeof incoming !== 'object') return res.status(400).json({ error: 'no_data' });

  const weeks = Object.keys(incoming).filter(w => WEEK_RE.test(w));
  if (!weeks.length) return res.status(400).json({ error: 'no_valid_weeks' });
  if (weeks.length > MAX_WEEKS) return res.status(400).json({ error: 'too_many_weeks' });

  let snap = await loadWeekData({ fresh: true });
  if (!snap || !snap.data) {
    const { default: bundled } = await import('../public/data.json', { with: { type: 'json' } });
    snap = bundled;
  }

  const data = { ...snap.data };
  const changed = [];
  for (const w of weeks) {
    const rec = incoming[w];
    // 빈 주차는 무시한다. 시트를 잘못 읽어 빈 값이 오면 멀쩡한 주차가 지워진다.
    if (!rec || typeof rec !== 'object' || !Object.keys(rec).length) continue;
    data[w] = rec;
    changed.push(w);
  }
  if (!changed.length) return res.status(200).json({ ok: true, changed: [] });

  const keys = Object.keys(data).sort();
  await saveWeekData({
    generatedAt: new Date().toISOString(),
    weekRange: [keys[0], keys[keys.length - 1]],
    weekCount: keys.length,
    data,
  });
  return res.status(200).json({ ok: true, changed });
}
