import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';

/* 미입력 알림 메일 — 관리자만.

   지난주 자료를 아직 안 낸 항목의 담당자에게 정해진 요일·시각(기본 화 16시)에 한 통씩.
   담당 이메일은 교회 시트의 「입력담당」 탭, 켜기·요일·시각은 「보고설정」 탭에 있고
   메일은 Apps Script(교회 계정)가 보낸다. 이 함수는 둘 사이를 이어 줄 뿐이다.

   GET                                    → { settings: { on, day, hour, trigger }, owners: [{ group, item, to }] }
   POST { action: 'save', on, day, hour }
   POST { action: 'owner', group, item, to }
   POST { action: 'plan' }                → 지금 보내면 누구에게 무엇이 가는지 + 예시 한 통
   POST { action: 'send' }                → 지금 보낸다 */

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
      const b = await callGas({ mode: 'reminder-settings' });
      return res.status(200).json({ settings: b.settings, owners: b.owners });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const body = req.body || {};
    if (body.action === 'save') {
      const day = DAYS.includes(body.day) ? body.day : '화';
      const hour = Math.min(23, Math.max(0, parseInt(body.hour, 10) || 0));
      const b = await callGas({ mode: 'reminder-settings-save', on: body.on ? '1' : '0', day, hour: String(hour) });
      return res.status(200).json(b.settings);
    }
    if (body.action === 'owner') {
      const to = (Array.isArray(body.to) ? body.to : String(body.to || '').split(/[,;\s]+/))
        .map(x => String(x).trim()).filter(x => EMAIL_RE.test(x)).slice(0, 10);
      const b = await callGas({ mode: 'reminder-owner-save', group: String(body.group || ''), item: String(body.item || ''), to: to.join(',') });
      return res.status(200).json(b.owner);
    }
    if (body.action === 'plan') {
      const b = await callGas({ mode: 'reminder-plan' });
      return res.status(200).json({ plan: b.plan, sample: b.sample, sampleTo: b.sampleTo });
    }
    if (body.action === 'send') {
      const b = await callGas({ mode: 'reminder-send' });
      return res.status(200).json(b.result);
    }
    return res.status(400).json({ error: 'unknown_action' });
  } catch (e) {
    return res.status(502).json({ error: 'apps_script', message: e.message });
  }
}
