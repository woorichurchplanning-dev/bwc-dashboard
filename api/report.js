import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';

/* 주간 데이터 보고 메일 — 관리자만.

   설정은 교회 시트의 「보고설정」 탭에 있고, 메일은 Apps Script(교회 계정)가 보낸다.
   이 함수는 관리자 화면과 Apps Script 사이를 이어 줄 뿐이다. 조회 키는 서버에만 둔다.

   GET                       → 설정 { to, on, day, hour, trigger }
   POST { action: 'save', to, on, day, hour }
   POST { action: 'preview' } → 지난주 보고 본문(HTML, 그림 포함)
   POST { action: 'send' }    → 지금 받는 사람 모두에게 한 통 */

const GAS = process.env.APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxJ1NDZxTpDsaVkb7GqlesBvlM_9lBBv2s4f53chZdqbHVnLZqOfVT1qzXVfsXW7qxA/exec';
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function callGas(params) {
  const key = process.env.SHEET_READ_KEY || '';
  const qs = new URLSearchParams({ ...params, key, t: String(Date.now()) });
  const r = await fetch(`${GAS}?${qs}`, { redirect: 'follow' });
  if (!r.ok) throw new Error(`apps_script_${r.status}`);
  const body = await r.json();
  if (!body.success) throw new Error(body.error || 'apps_script_failed');
  return body;
}

export default async function handler(req, res) {
  const s = await verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  if (s.a !== 1) return res.status(403).json({ error: 'forbidden' });
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    if (req.method === 'GET') {
      const b = await callGas({ mode: 'report-settings' });
      return res.status(200).json(b.settings);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const body = req.body || {};
    if (body.action === 'save') {
      const to = (Array.isArray(body.to) ? body.to : String(body.to || '').split(/[,;\s]+/))
        .map(x => String(x).trim()).filter(x => EMAIL_RE.test(x));
      if (to.length > 50) return res.status(400).json({ error: 'too_many_recipients' });
      const day = DAYS.includes(body.day) ? body.day : '수';
      const hour = Math.min(23, Math.max(0, parseInt(body.hour, 10) || 0));
      const b = await callGas({ mode: 'report-settings-save', to: to.join(','), on: body.on ? '1' : '0', day, hour: String(hour) });
      return res.status(200).json(b.settings);
    }
    if (body.action === 'preview') {
      const b = await callGas({ mode: 'report' });
      return res.status(200).json({ subject: b.subject, week: b.week, html: b.html });
    }
    if (body.action === 'send') {
      const b = await callGas({ mode: 'report-send' });
      return res.status(200).json({ sent: b.sent });
    }
    return res.status(400).json({ error: 'unknown_action' });
  } catch (e) {
    return res.status(502).json({ error: 'apps_script', message: e.message });
  }
}
