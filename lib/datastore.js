/* 주간 데이터(data.json) 저장소 — Vercel Blob.
   예전에는 GitHub Action이 vercel deploy 로 파일을 올렸는데, 배포 토큰이
   회전하거나 scope가 어긋나면 데이터 갱신이 통째로 멈췄다. 실제로 그렇게 멈췄다.
   이제 Action은 Blob에만 쓰고, 배포는 코드가 바뀔 때만 한다.
   토큰(BLOB_READ_WRITE_TOKEN)은 이 스토어 하나에만 쓰이고 회전하지 않는다.
   내용은 STORE_KEY로 암호화한다 — Blob URL은 공개 읽기이기 때문. */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const STORE_KEY  = process.env.STORE_KEY || '';
const PREFIX     = 'weekdata-';
const CACHE_MS   = 30_000;

let cache = { at: 0, data: null };
export const canUseBlob = () => Boolean(BLOB_TOKEN && STORE_KEY);

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

function api(path, init = {}) {
  return fetch(`https://blob.vercel-storage.com/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7', ...(init.headers || {}) },
  });
}

/* 저장할 때마다 새 경로를 쓴다. 같은 경로를 덮어쓰면 CDN이 2분 넘게 옛 내용을 준다. */
async function newestUrl() {
  const res = await api(`?prefix=${PREFIX}&limit=100`);
  if (!res.ok) throw new Error(`blob list ${res.status}`);
  const { blobs = [] } = await res.json();
  if (!blobs.length) return null;
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return blobs[0].url;
}

export async function loadWeekData({ fresh = false } = {}) {
  if (!canUseBlob()) return null;
  const now = Date.now();
  if (!fresh && cache.data && now - cache.at < CACHE_MS) return cache.data;
  const url = await newestUrl();
  if (!url) return null;                       // 아직 올린 적 없음 → 번들 사본으로 폴백
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`blob get ${res.status}`);
  const data = await decrypt(await res.arrayBuffer());
  cache = { at: now, data };
  return data;
}

export async function saveWeekData(snapshot) {
  if (!canUseBlob()) throw new Error('blob 설정 없음');
  if (!snapshot || !snapshot.data) throw new Error('snapshot 형식 오류');
  const name = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.enc`;
  const res = await api(name, {
    method: 'PUT',
    headers: { 'x-content-type': 'application/octet-stream',
               'x-add-random-suffix': '0', 'x-cache-control-max-age': '0' },
    body: await encrypt(snapshot),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${(await res.text()).slice(0, 160)}`);
  cache = { at: Date.now(), data: snapshot };

  // 최근 3개만 남긴다
  try {
    const list = await api(`?prefix=${PREFIX}&limit=100`);
    if (list.ok) {
      const { blobs = [] } = await list.json();
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const old = blobs.slice(3).map(b => b.url);
      if (old.length) await api('delete', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls: old }) });
    }
  } catch (e) { console.warn('예전 스냅샷 정리 실패(무시):', e.message); }
  return true;
}
