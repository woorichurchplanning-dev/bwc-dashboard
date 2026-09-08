import { cookieHeader } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', cookieHeader('', 0));
  return res.status(200).json({ ok: true });
}
