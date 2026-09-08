import { verifySession, readCookie, SESSION_COOKIE } from '../lib/auth.js';

/* 로그인한 사용자의 권한을 프런트에 알려준다.
   미들웨어가 이미 막고 있으므로 여기 도달했다면 세션은 유효하다. */
export default async function handler(req, res) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  const s = await verifySession(token, process.env.SESSION_SECRET || '');
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({
    id: s.u, name: s.n, admin: s.a === 1,
    tabs: s.t, schoolDepts: s.sd, youthDepts: s.yd, youthTeams: s.yt, districts: s.di,
    mustChangePassword: s.mc === 1,
    expiresAt: s.exp,
  });
}
