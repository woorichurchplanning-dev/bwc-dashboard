/* 계정 저장소 — Vercel Blob.
   · 토큰(BLOB_READ_WRITE_TOKEN)은 이 Blob 스토어 하나에만 접근한다(최소 권한).
   · Blob URL은 공개 읽기이므로 내용을 STORE_KEY로 AES-256-GCM 암호화해 저장한다.
     URL이 새더라도 암호문만 남는다.
   · 객체 주소는 토큰에서 결정론적으로 만든다. 예전에는 목록(list) API로 URL을
     찾았는데, 목록이 순간적으로 비어 오면 '최초 실행'으로 오인해 저장소를 빈 값으로
     덮어써 계정이 전부 사라지는 사고가 있었다. 이제 목록을 쓰지 않고, 404는
     '아직 없음'으로만 해석하고 절대 자동으로 쓰지 않는다. */
import seed from '../users.json' with { type: 'json' };

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const STORE_KEY  = process.env.STORE_KEY || '';
const OBJECT     = 'users.enc';
const CACHE_MS   = 15_000;

let cache = { at: 0, data: null };

export const canWrite = () => Boolean(BLOB_TOKEN && STORE_KEY);

/* vercel_blob_rw_<STOREID>_<secret> → https://<storeid>.public.blob.vercel-storage.com */
function baseUrl() {
  const id = BLOB_TOKEN.split('_')[3];
  if (!id) throw new Error('blob token 형식을 해석할 수 없습니다');
  return `https://${id.toLowerCase()}.public.blob.vercel-storage.com`;
}

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

const EMPTY = { _comment: '대시보드 사용자 (암호화 저장)', users: [] };
const PREFIX = 'users-';

function api(path, init = {}) {
  return fetch(`https://blob.vercel-storage.com/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${BLOB_TOKEN}`, 'x-api-version': '7', ...(init.headers || {}) },
  });
}

/* 최신 스냅샷의 URL. 같은 경로를 덮어쓰면 CDN이 max-age=0을 무시하고 2분 넘게
   옛 내용을 돌려준다(x-vercel-cache: HIT). 그래서 저장할 때마다 새 경로를 만들고
   목록에서 가장 최근 것을 고른다 — 새 URL은 캐시가 없어 항상 최신이다. */
async function newestUrl() {
  const res = await api(`?prefix=${PREFIX}&limit=100`);
  if (!res.ok) throw new Error(`blob list ${res.status}`);
  const { blobs = [] } = await res.json();
  if (!blobs.length) return null;
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return blobs[0].url;
}

export async function loadStore({ fresh = false } = {}) {
  if (!canWrite()) return { data: seed, readOnly: true };
  const now = Date.now();
  if (!fresh && cache.data && now - cache.at < CACHE_MS) return { data: cache.data, readOnly: false };

  const url = await newestUrl();
  if (!url) {
    // 아직 만들어지지 않은 상태. 여기서 절대 쓰지 않는다 — 목록이 일시적으로 비어
    // 오는 경우까지 '최초 실행'으로 오인해 계정을 통째로 날릴 수 있다.
    return { data: EMPTY, readOnly: false, missing: true };
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`blob get ${res.status}`);
  const data = await decrypt(await res.arrayBuffer());
  cache = { at: now, data };
  return { data, readOnly: false };
}

export async function saveStore(data) {
  if (!canWrite()) throw new Error('read_only');
  if (!data || !Array.isArray(data.users)) throw new Error('invalid_store');

  const name = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.enc`;
  const res = await api(name, {
    method: 'PUT',
    headers: {
      'x-content-type': 'application/octet-stream',
      'x-add-random-suffix': '0',
      'x-cache-control-max-age': '0',
    },
    body: await encrypt(data),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${(await res.text()).slice(0, 160)}`);
  cache = { at: Date.now(), data };

  // 예전 스냅샷 정리 — 최근 3개만 남긴다(되돌릴 여지를 조금 남겨 둔다)
  try {
    const list = await api(`?prefix=${PREFIX}&limit=100`);
    if (list.ok) {
      const { blobs = [] } = await list.json();
      blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      const old = blobs.slice(3).map((b) => b.url);
      if (old.length) {
        await api('delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ urls: old }),
        });
      }
    }
  } catch (e) { console.warn('예전 스냅샷 정리 실패(무시):', e.message); }

  return true;
}
