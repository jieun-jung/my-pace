const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const AUTH_KEY = "my-pace.supabase.auth.v1";
const PHOTO_BUCKET = "my-pace-photos";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export function readAuthSession() {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return session?.access_token && session?.user?.id ? session : null;
  } catch {
    return null;
  }
}

function saveAuthSession(session) {
  const normalized = session?.access_token
    ? { ...session, expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600) }
    : null;
  if (normalized) localStorage.setItem(AUTH_KEY, JSON.stringify(normalized));
  else localStorage.removeItem(AUTH_KEY);
  return normalized;
}

async function responseError(response) {
  let detail = "요청을 완료하지 못했어요.";
  try {
    const payload = await response.json();
    detail = payload.msg || payload.message || payload.error_description || payload.error || detail;
  } catch {
    // Use a safe generic message when the server response is not JSON.
  }
  if (response.status === 401) detail = "로그인이 만료됐어요. 다시 로그인해주세요.";
  return new Error(detail);
}

async function authRequest(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function signIn(email, password) {
  const session = await authRequest("token?grant_type=password", { email, password });
  return saveAuthSession(session);
}

export async function signUp(email, password) {
  const result = await authRequest("signup", { email, password });
  return result.access_token ? saveAuthSession(result) : null;
}

export async function signOut() {
  const session = readAuthSession();
  try {
    if (session?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
  } finally {
    saveAuthSession(null);
  }
}

async function validAccessToken() {
  let session = readAuthSession();
  if (!session) throw new Error("로그인이 필요해요.");
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session.access_token;
  try {
    session = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    saveAuthSession(session);
    return session.access_token;
  } catch {
    saveAuthSession(null);
    throw new Error("로그인이 만료됐어요. 다시 로그인해주세요.");
  }
}

async function apiRequest(path, options = {}) {
  const token = await validAccessToken();
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  if (!response.ok) throw await responseError(response);
  return response;
}

function imagePath(userId, kind, parentId, itemId) {
  return kind === "books"
    ? `${userId}/books/${itemId}.jpg`
    : `${userId}/sessions/${parentId}/${itemId}.jpg`;
}

async function uploadDataImage(path, dataUrl) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  await apiRequest(`/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg", "x-upsert": "true" },
    body: blob,
  });
}

async function dataUrlFromPhoto(path) {
  const response = await apiRequest(`/storage/v1/object/${PHOTO_BUCKET}/${path}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("저장된 사진을 불러오지 못했어요."));
    reader.readAsDataURL(blob);
  });
}

async function hydratePhoto(item) {
  if (!item.photoPath) return;
  try {
    item.photo = await dataUrlFromPhoto(item.photoPath);
  } catch {
    item.photo = "";
  }
}

export async function loadAccountData(userId) {
  const response = await apiRequest(`/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=payload&limit=1`);
  const rows = await response.json();
  if (!rows.length) return null;
  const data = rows[0].payload || { books: [], sessions: [] };
  await Promise.all([
    ...(data.books || []).map(hydratePhoto),
    ...(data.sessions || []).flatMap((session) => (session.questions || []).map(hydratePhoto)),
  ]);
  return { books: data.books || [], sessions: data.sessions || [] };
}

export async function saveAccountData(data, userId) {
  const localData = JSON.parse(JSON.stringify(data));
  const payload = JSON.parse(JSON.stringify(data));
  const photos = [];
  let photosChanged = false;
  for (let i = 0; i < localData.books.length; i++) {
    photos.push([localData.books[i], payload.books[i], imagePath(userId, "books", "", localData.books[i].id)]);
  }
  for (let i = 0; i < localData.sessions.length; i++) {
    const localSession = localData.sessions[i], cloudSession = payload.sessions[i];
    for (let j = 0; j < localSession.questions.length; j++) {
      const question = localSession.questions[j];
      photos.push([question, cloudSession.questions[j], imagePath(userId, "sessions", localSession.id, question.id)]);
    }
  }
  await Promise.all(photos.map(async ([localItem, cloudItem, defaultPath]) => {
    if (typeof localItem.photo === "string" && localItem.photo.startsWith("data:image/")) {
      const path = localItem.photoPath || defaultPath;
      if (!localItem.photoPath) await uploadDataImage(path, localItem.photo);
      if (localItem.photoPath !== path) photosChanged = true;
      localItem.photoPath = cloudItem.photoPath = path;
      delete cloudItem.photo;
    } else if (cloudItem.photoPath) {
      delete cloudItem.photo;
    }
  }));
  const response = await apiRequest("/rest/v1/user_data?on_conflict=user_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, payload, updated_at: new Date().toISOString() }),
  });
  return { response, localData, photosChanged };
}

