import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';

/* 시트 조회 중계.

   예전에는 화면이 Apps Script 주소를 직접 불렀다. 그 주소가 공개 저장소에
   그대로 들어 있었고 Apps Script 는 아무나 열 수 있게 배포돼 있어서,
   로그인 없이 그 주소만 알면 전 교인 출석·헌금 자료를 다 받아 갈 수 있었다.
   이제 조회 키는 서버에만 두고, 로그인한 사람의 요청만 대신 보내 준다. */

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const GAS = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA/exec';

export default async function handler(req, res) {
  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });

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
