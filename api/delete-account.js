import { readFileSync } from "node:fs";

function readLocalEnvironment() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
          if (!match) return null;
          let value = match[2];
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
          else value = value.replace(/\s+#.*$/, "").trim();
          return [match[1], value];
        })
        .filter(Boolean),
    );
  } catch {
    return {};
  }
}

const localEnvironment = readLocalEnvironment();
const environment = (name) => process.env[name] || localEnvironment[name] || "";

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function errorMessage(response) {
  try {
    const payload = await response.json();
    return payload.message || payload.msg || payload.error_description || payload.error || "Supabase 요청을 완료하지 못했어요.";
  } catch {
    return "Supabase 요청을 완료하지 못했어요.";
  }
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json(405, { error: "POST 요청만 사용할 수 있어요." });

    const supabaseUrl = environment("VITE_SUPABASE_URL").replace(/\/$/, "");
    const anonKey = environment("VITE_SUPABASE_ANON_KEY");
    const serviceKey = environment("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey) return json(503, { error: "서버의 Supabase URL과 anon key를 확인해주세요." });
    if (!serviceKey) return json(503, { error: "계정 탈퇴 기능을 사용하려면 Vercel에 SUPABASE_SERVICE_ROLE_KEY를 등록해주세요." });

    const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return json(401, { error: "로그인이 필요해요." });

    const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
    try {
      const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!userResponse.ok) return json(401, { error: "로그인이 만료됐어요. 다시 로그인해주세요." });
      const user = await userResponse.json();
      if (!user?.id) return json(401, { error: "로그인 계정을 확인하지 못했어요." });

      // Remove every file in the private bucket first; Supabase prevents deleting
      // an auth user while that user still owns storage objects.
      const paths = [];
      const pending = [`${user.id}/`];
      while (pending.length) {
        const prefix = pending.pop();
        let offset = 0;
        while (true) {
          const listResponse = await fetch(`${supabaseUrl}/storage/v1/object/list/my-pace-photos`, {
            method: "POST",
            headers: adminHeaders,
            body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
          });
          if (!listResponse.ok) throw new Error(await errorMessage(listResponse));
          const objects = await listResponse.json();
          for (const object of objects) {
            if (object.id || object.metadata) paths.push(`${prefix}${object.name}`);
            else pending.push(`${prefix}${object.name}/`);
          }
          if (objects.length < 1000) break;
          offset += objects.length;
        }
      }

      for (let index = 0; index < paths.length; index += 100) {
        const removeResponse = await fetch(`${supabaseUrl}/storage/v1/object/my-pace-photos`, {
          method: "DELETE",
          headers: adminHeaders,
          body: JSON.stringify({ prefixes: paths.slice(index, index + 100) }),
        });
        if (!removeResponse.ok) throw new Error(await errorMessage(removeResponse));
      }

      const dataResponse = await fetch(`${supabaseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { ...adminHeaders, Prefer: "return=minimal" },
      });
      if (!dataResponse.ok) throw new Error(await errorMessage(dataResponse));

      const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      if (!deleteResponse.ok) throw new Error(await errorMessage(deleteResponse));
      return json(200, { ok: true });
    } catch (error) {
      return json(500, { error: error.message || "계정을 삭제하지 못했어요. 잠시 뒤 다시 시도해주세요." });
    }
  },
};
