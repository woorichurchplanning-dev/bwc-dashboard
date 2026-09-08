/* 계정 저장소 — Vercel Blob.
   · 토큰(BLOB_READ_WRITE_TOKEN)은 이 Blob 스토어 하나에만 접근할 수 있다(최소 권한).
   · Blob URL은 추측하기 어렵지만 공개 읽기이므로, 비밀번호 해시가 든 내용을
     STORE_KEY로 AES-256-GCM 암호화해서 저장한다. URL이 새더라도 암호문만 남는다.
   · 스토어가 비어 있으면 번들된 users.json으로 자동 초기화한다. */
import seed from '../users.json' with { type: 'json' };

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const STORE_KEY  = process.env.STORE_KEY || '';
const OBJECT     = 'users.enc';
const CACHE_MS   = 30_000;

let cache = { at: 0, data: null, url: null };

export const canWrite = () => Boolean(BLOB_TOKEN && STORE_KEY);

/* ── 암복호화 ── */
const te = new TextEncoder(), td = new TextDecoder();
async function aesKey() {
  const raw = await crypto.subtle.digest('SHA-256', te.encode(STORE_KEY));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await aesKey(), te.encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return out;
}
async function decrypt(bytes) {
  const buf = new Uint8Array(bytes);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.slice(0, 12) }, await aesKey(), buf.slice(12));
  return JSON.parse(td.decode(pt));
}

/* ── Blob REST ── */
async function blobPut(bytes) {
  const res = await fetch(`https://blob.vercel-storage.com/${OBJECT}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${BLOB_TOKEN}`,
      'x-api-version': '7',
      'x-content-type': 'application/octet-stream',
      'x-add-random-suffix': '0',        // 경로 고정 — 항상 같은 객체를 덮어쓴다
      'x-cache-control-max-age': '0',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).url;
}

async function blobUrl() {
  const res = await fetch(`https://blob.vercel-storage.com/?prefix=${OBJECT}&limit=1`, {
    headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7' },
  });
  if (!res.ok) return null;
  const { blobs } = await res.json();
  return blobs?.[0]?.url || null;
}

export async function loadStore({ fresh = false } = {}) {
  if (!canWrite()) return { data: seed, readOnly: true };
  const now = Date.now();
  if (!fresh && cache.data && now - cache.at < CACHE_MS) return { data: cache.data, readOnly: false };
  try {
    const url = await blobUrl();
    if (!url) {                                   // 최초 실행 — 씨앗으로 초기화
      await saveStore(seed, '초기화');
      return { data: seed, readOnly: false };
    }
    const res = await fetch(`${url}?t=${now}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`blob get ${res.status}`);
    const data = await decrypt(await res.arrayBuffer());
    cache = { at: now, data, url };
    return { data, readOnly: false };
  } catch (e) {
    console.error('계정 저장소 조회 실패, 번들 사본 사용:', e.message);
    return { data: seed, readOnly: true };
  }
}

export async function saveStore(data) {
  if (!canWrite()) throw new Error('read_only');
  const url = await blobPut(await encrypt(data));
  cache = { at: Date.now(), data, url };
  return url;
}
