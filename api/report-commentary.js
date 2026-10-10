import { readFileSync } from "node:fs";

const allowedDifficulties = new Set(["쉬움", "보통", "어려움"]);
const recentRequests = new Map();

function readLocalEnvironment() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
          if (!match) return null;
          let value = match[2];
          if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          } else {
            value = value.replace(/\s+#.*$/, "").trim();
          }
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

function outputText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("\n");
}

export default {
async fetch(request) {
  if (request.method !== "POST") return json(405, { error: "POST 요청만 사용할 수 있어요." });
  const supabaseUrl = environment("VITE_SUPABASE_URL").replace(/\/$/, "");
  const supabaseKey = environment("VITE_SUPABASE_ANON_KEY");
  const openAiKey = environment("OPENAI_API_KEY");
  if (!supabaseUrl || !supabaseKey) {
    const missing = [!supabaseUrl && "VITE_SUPABASE_URL", !supabaseKey && "VITE_SUPABASE_ANON_KEY"].filter(Boolean);
    return json(503, { error: "서버의 Supabase 환경 변수를 확인해주세요.", missing });
  }

  const bearer = request.headers.get("authorization") || "";
  const accessToken = bearer.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json(401, { error: "로그인이 필요해요." });

  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!authResponse.ok) return json(401, { error: "로그인이 만료됐어요. 다시 로그인해주세요." });
    const authenticatedUser = await authResponse.json();
    if (!authenticatedUser?.id) return json(401, { error: "로그인을 확인하지 못했어요." });
    if (!openAiKey) return json(503, { error: "Vercel 환경 변수에 OPENAI_API_KEY를 추가한 뒤 다시 배포해주세요." });
    const now = Date.now(), previousRequest = recentRequests.get(authenticatedUser.id) || 0;
    if (now - previousRequest < 30000) return json(429, { error: "코멘트를 연달아 요청했어요. 잠시 뒤 다시 시도해주세요." });
    recentRequests.set(authenticatedUser.id, now);
    if (recentRequests.size > 1000) for (const [id, time] of recentRequests) if (now - time > 3600000) recentRequests.delete(id);

    const rawBody = await request.text();
    if (rawBody.length > 16000) return json(413, { error: "요청 데이터가 너무 커요." });
    let body;
    try { body = JSON.parse(rawBody); } catch { return json(400, { error: "요청 형식이 올바르지 않아요." }); }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body?.month || "")) return json(400, { error: "레포트 월을 확인해주세요." });
    if (!Array.isArray(body?.books) || body.books.length < 1 || body.books.length > 30) return json(400, { error: "분석할 문제집 기록을 확인해주세요." });

    const books = body.books.map((book, index) => {
      if (!allowedDifficulties.has(book?.difficulty)) throw new Error("문제집 난이도 정보를 확인해주세요.");
      const key = `book_${index + 1}`;
      const accuracy = book.accuracy === null ? null : Number(book.accuracy);
      const total = Number(book.total), solved = Number(book.solved), skipped = Number(book.skipped || 0), graded = Number(book.graded);
      const averageSeconds = Number(book.averageSeconds), studyDays = Number(book.studyDays);
      if (![total, solved, skipped, graded, averageSeconds, studyDays].every(Number.isInteger) || total < 1 || total > 10000 || solved < 0 || skipped < 0 || solved + skipped > total || graded < 0 || graded > total || averageSeconds < 0 || averageSeconds > 86400 || studyDays < 0 || studyDays > 31 || (accuracy !== null && (!Number.isInteger(accuracy) || accuracy < 0 || accuracy > 100))) {
        throw new Error("레포트 통계 값이 올바르지 않아요.");
      }
      return { key, difficulty: book.difficulty, total, solved, skipped, graded, accuracy, averageSeconds, studyDays };
    });

    const summary = body.summary || {};
    const totalSeconds = Number(summary.totalSeconds), studyDays = Number(summary.studyDays), overallAccuracy = summary.accuracy === null ? null : Number(summary.accuracy);
    if (!Number.isInteger(totalSeconds) || totalSeconds < 0 || totalSeconds > 2678400 || !Number.isInteger(studyDays) || studyDays < 0 || studyDays > 31 || (overallAccuracy !== null && (!Number.isInteger(overallAccuracy) || overallAccuracy < 0 || overallAccuracy > 100))) {
      return json(400, { error: "월간 요약 값이 올바르지 않아요." });
    }

    const promptData = { month: body.month, summary: { totalSeconds, studyDays, accuracy: overallAccuracy }, books };
    const modelResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: environment("OPENAI_MODEL") || "gpt-6-luna",
        store: false,
        max_output_tokens: 700,
        instructions: "초등 고학년 수학 학습을 돕는 다정하고 현실적인 선생님이다. 아래 익명 통계만 근거로 한국어 코멘트를 작성한다. 문제집 난이도를 고려해 성과를 해석하고, 건너뛴 문항은 실제 풀이 문항이나 정답률에 포함하지 않는다. 각 문제집에는 구체적으로 실행할 다음 풀이 전략 한 가지를 덧붙인다. 데이터에 없는 향상이나 원인을 지어내지 않는다. 아이를 탓하거나 등급을 매기지 않는다. 전체 코멘트는 1~2문장, 문제집별 코멘트는 각 1~2문장으로 짧게 쓴다. 정확도 기록이 없으면 정답률을 추측하지 말고 채점 기록을 쌓자고 안내한다. 요청된 JSON 형식만 출력한다.",
        input: JSON.stringify(promptData),
        text: {
          format: {
            type: "json_schema",
            name: "monthly_study_feedback",
            strict: true,
            schema: {
              type: "object",
              properties: {
                overall: { type: "string" },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { key: { type: "string" }, comment: { type: "string" } },
                    required: ["key", "comment"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["overall", "comments"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!modelResponse.ok) {
      let apiError = {};
      try { apiError = (await modelResponse.json()).error || {}; } catch { /* Keep a safe generic message if the API response is not JSON. */ }
      if (modelResponse.status === 429) {
        const code = apiError.code || apiError.type || "";
        if (code === "insufficient_quota") return json(503, { error: "OpenAI API 사용 한도 또는 결제 설정을 확인해주세요. OpenAI Platform의 Billing과 Usage를 확인한 뒤 다시 시도해주세요." });
        if (code === "rate_limit_exceeded") return json(503, { error: "OpenAI API 요청 한도에 도달했어요. 잠시 기다린 뒤 다시 시도해주세요." });
        return json(503, { error: "OpenAI API가 요청을 제한했어요. 사용 한도와 결제 상태를 확인하고 잠시 뒤 다시 시도해주세요." });
      }
      return json(502, { error: "AI 코멘트를 만들지 못했어요. 잠시 후 다시 시도해주세요." });
    }
    const result = await modelResponse.json();
    const text = outputText(result);
    const feedback = JSON.parse(text);
    const validKeys = new Set(books.map((book) => book.key));
    if (typeof feedback.overall !== "string" || !Array.isArray(feedback.comments)) throw new Error("AI 코멘트 형식이 올바르지 않아요.");
    return json(200, {
      overall: feedback.overall.slice(0, 500),
      comments: feedback.comments
        .filter((item) => validKeys.has(item.key) && typeof item.comment === "string")
        .map((item) => ({ key: item.key, comment: item.comment.slice(0, 400) })),
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json(502, { error: "AI 응답을 읽지 못했어요. 다시 시도해주세요." });
    if (/난이도|통계 값/.test(error.message || "")) return json(400, { error: error.message });
    return json(500, { error: "AI 코멘트를 만들지 못했어요. 잠시 후 다시 시도해주세요." });
  }
}
};
