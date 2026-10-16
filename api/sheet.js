import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';

/* 시트 조회 중계.

   예전에는 화면이 Apps Script 주소를 직접 불렀다. 그 주소가 공개 저장소에
   그대로 들어 있었고 Apps Script 는 아무나 열 수 있게 배포돼 있어서,
   로그인 없이 그 주소만 알면 전 교인 출석·헌금 자료를 다 받아 갈 수 있었다.
   이제 조회 키는 서버에만 두고, 로그인한 사람의 요청만 대신 보내 준다. */

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const GAS = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA/exec';

/* 주일 행사 태그 — 대시보드 주일예배 탭에서 그 주일에 성찬식·새생명 축제 같은 이름을 붙인다.
   시트에는 '주일행사/주일' 줄 하나로 들어간다(서현·송림 줄에 쓰면 그 부서가 '제출'로 잡힌다).
   주일예배 탭을 볼 수 있는 사람만 쓸 수 있다. */
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

async function saveSundayEvent(req, res, s) {
  if (!(s.a === 1 || (s.t || []).includes('sunday'))) return res.status(403).json({ error: 'forbidden' });
  const b = req.body || {};
  const week = String(b.weekKey || '');
  if (!WEEK_RE.test(week) || new Date(week + 'T00:00:00Z').getUTCDay() !== 0) return res.status(400).json({ error: 'bad_week' });
  const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map(t => clean(t, 30).replace(/,/g, ' ')).filter(Boolean))].slice(0, 10);
  const memo = clean(b.memo, 300);
  const formData = { '행사': tags.join(','), '행사 메모': memo };
  try {
    const r = await fetch(GAS, {
      method: 'POST', redirect: 'follow',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ weekKey: week, groupKey: '주일행사', itemName: '주일', formData, notes: { by: `대시보드 ${s.n || s.u}` } }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.success) return res.status(502).json({ error: 'apps_script_failed', detail: body.error || r.status });
    return res.status(200).json({ ok: true, weekKey: week, tags, memo, savedAt: body.savedAt });
  } catch (e) {
    return res.status(502).json({ error: 'apps_script_unreachable', detail: e.message });
  }
}

export default async function handler(req, res) {
  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });

  if (req.method === 'POST') return saveSundayEvent(req, res, s);

  // 지금까지 쓴 행사 태그 이름 목록 (Apps Script 가 저장할 때마다 모아 둔다)
  if (req.query.mode === 'event-tags') {
    try {
      const r = await fetch(`${GAS}?mode=event-tags`, { redirect: 'follow' });
      const body = await r.json();
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ tags: Array.isArray(body.tags) ? body.tags : [] });
    } catch (e) {
      return res.status(502).json({ error: 'apps_script_unreachable', detail: e.message });
    }
  }

  const weeks = String(req.query.weekKeys || '').split(',').map(w => w.trim()).filter(w => WEEK_RE.test(w));
  if (!weeks.length) return res.status(400).json({ error: 'no_valid_weeks' });
  if (weeks.length > 12) return res.status(400).json({ error: 'too_many_weeks' });

  const key = process.env.SHEET_READ_KEY || '';
  const url = `${GAS}?weekKeys=${weeks.join(',')}` + (key ? `&key=${encodeURIComponent(key)}` : '');
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: `apps_script_${r.status}` });
    const body = await r.json();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(body);
  } catch (e) {
    return res.status(502).json({ error: 'apps_script_unreachable', detail: e.message });
  }
}
