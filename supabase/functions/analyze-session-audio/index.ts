const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const prompt = `Você é um assistente educacional do app Coliseu, um app de estudos para concurso da PMMG. Analise o áudio do aluno. Transcreva a fala, resuma o que foi aprendido, identifique dúvidas, gere insights-chave e sugira uma revisão prática. Seja objetivo, claro e útil para estudo de concurso. Não invente informações que não estejam no áudio. Se o áudio estiver vazio, confuso ou inaudível, informe isso claramente. Responda somente em JSON válido, sem markdown.`;

function parseJson(text: string) {
  const clean = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(clean);
}

function normalizeAiPayload(input: any) {
  const review = input?.revisao_sugerida && typeof input.revisao_sugerida === "object" ? input.revisao_sugerida : {};
  return {
    transcricao: String(input?.transcricao || "").slice(0, 12000),
    resumo: String(input?.resumo || "").slice(0, 2500),
    insights: Array.isArray(input?.insights)
      ? input.insights.slice(0, 5).map((item: any) => ({
          titulo: String(item?.titulo || "Insight").slice(0, 80),
          descricao: String(item?.descricao || "").slice(0, 500),
        }))
      : [],
    duvidas_detectadas: Array.isArray(input?.duvidas_detectadas)
      ? input.duvidas_detectadas.slice(0, 5).map((item: any) => String(item).slice(0, 300))
      : [],
    revisao_sugerida: {
      titulo: String(review.titulo || "Revisão recomendada").slice(0, 120),
      descricao: String(review.descricao || "").slice(0, 700),
      prioridade: ["baixa", "media", "alta"].includes(review.prioridade) ? review.prioridade : "media",
    },
    proxima_tarefa: String(input?.proxima_tarefa || "").slice(0, 500),
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const authHeader = req.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceKey || !geminiKey) return json({ error: "Function secrets are not configured" }, 500);
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing user token" }, 401);

  const { audio_note_id } = await req.json().catch(() => ({}));
  if (!audio_note_id) return json({ error: "audio_note_id is required" }, 400);

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: authHeader },
  });
  if (!userRes.ok) return json({ error: "Invalid session" }, 401);
  const user = await userRes.json();
  const userId = user?.id;
  if (!userId) return json({ error: "Invalid user" }, 401);

  const noteUrl = `${supabaseUrl}/rest/v1/session_audio_notes?id=eq.${encodeURIComponent(audio_note_id)}&user_id=eq.${encodeURIComponent(userId)}&select=*`;
  const noteRes = await fetch(noteUrl, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!noteRes.ok) {
    const detail = await noteRes.text().catch(() => "");
    return json({ error: "Could not read audio note", detail }, noteRes.status);
  }
  const notes = await noteRes.json();
  const note = Array.isArray(notes) ? notes[0] : null;
  if (!note) return json({ error: "Audio note not found" }, 404);
  if (!note.audio_path) return json({ error: "Audio path is missing" }, 400);
  if (Number(note.duration_seconds || 0) > 90) return json({ error: "Audio is too long" }, 400);

  await fetch(`${supabaseUrl}/rest/v1/session_audio_notes?id=eq.${encodeURIComponent(audio_note_id)}`, {
    method: "PATCH",
    headers: {
      apikey: anonKey,
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "processing", error_message: null }),
  });

  const objectRes = await fetch(`${supabaseUrl}/storage/v1/object/session-audios/${note.audio_path}`, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!objectRes.ok) {
    return json({ error: "Could not load private audio" }, 404);
  }
  const audioBytes = new Uint8Array(await objectRes.arrayBuffer());
  if (audioBytes.byteLength < 800) return json({ error: "Audio is empty" }, 400);
  if (audioBytes.byteLength > 6_000_000) return json({ error: "Audio file is too large" }, 400);

  const base64 = bytesToBase64(audioBytes);
  const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: `${prompt}\n\nFormato obrigatório:\n{"transcricao":"","resumo":"","insights":[{"titulo":"","descricao":""}],"duvidas_detectadas":[],"revisao_sugerida":{"titulo":"","descricao":"","prioridade":"baixa | media | alta"},"proxima_tarefa":""}` },
          { inlineData: { mimeType: note.audio_url?.includes("audio/") ? note.audio_url : "audio/webm", data: base64 } },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  const geminiBody = await geminiRes.json().catch(() => null);
  if (!geminiRes.ok) {
    await fetch(`${supabaseUrl}/rest/v1/session_audio_notes?id=eq.${encodeURIComponent(audio_note_id)}`, {
      method: "PATCH",
      headers: { apikey: anonKey, Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed", error_message: geminiBody?.error?.message || "Gemini request failed" }),
    });
    return json({ error: "Gemini request failed", detail: geminiBody?.error?.message || null }, 502);
  }

  const text = geminiBody?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("\n") || "{}";
  let result;
  try {
    result = normalizeAiPayload(parseJson(text));
  } catch (error) {
    await fetch(`${supabaseUrl}/rest/v1/session_audio_notes?id=eq.${encodeURIComponent(audio_note_id)}`, {
      method: "PATCH",
      headers: { apikey: anonKey, Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed", error_message: "Gemini did not return valid JSON" }),
    });
    return json({ error: "Gemini did not return valid JSON", detail: String(error) }, 502);
  }

  await fetch(`${supabaseUrl}/rest/v1/session_audio_notes?id=eq.${encodeURIComponent(audio_note_id)}`, {
    method: "PATCH",
    headers: { apikey: anonKey, Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      transcription: result.transcricao,
      ai_summary: result.resumo,
      insights: result.insights,
      detected_doubts: result.duvidas_detectadas,
      suggested_review: result.revisao_sugerida,
      next_task: result.proxima_tarefa,
      status: "completed",
      error_message: null,
    }),
  });

  return json(result);
});
