import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { constantTimeEqual, formatProposal, isLinkCode, isUuid, parseAiJson } from "../_shared/telegram-utils.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" }
  });
}

function readDefaultKeyMap(name: string): string {
  const raw = Deno.env.get(name) || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.default === "string" ? parsed.default : "";
  } catch {
    return "";
  }
}

function getServiceKey(): string {
  return readDefaultKeyMap("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const key = getServiceKey();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json", ...extra };
  if (key && !key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
  return headers;
}

async function readJson(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Request body too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyAppUser(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token || token.startsWith("sb_publishable_") || token === anonKey) return null;
  const response = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: { apikey: anonKey, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user && typeof user.id === "string" ? user : null;
}

async function createLinkCode(req: Request, supabaseUrl: string, anonKey: string) {
  const user = await verifyAppUser(req, supabaseUrl, anonKey);
  if (!user) return json({ error: "Нужно войти в RPG-LIFE." }, 401);
  const code = randomCode();
  const codeHash = await sha256(code);
  const deleteResponse = await fetch(
    supabaseUrl + "/rest/v1/telegram_link_codes?user_id=eq." + encodeURIComponent(user.id),
    { method: "DELETE", headers: serviceHeaders() }
  );
  if (!deleteResponse.ok) throw new Error("Could not rotate Telegram link code");
  const insertResponse = await fetch(supabaseUrl + "/rest/v1/telegram_link_codes", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ code_hash: codeHash, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
  });
  if (!insertResponse.ok) throw new Error("Could not create Telegram link code");
  return json({ code, expires_in_seconds: 600 });
}

async function rest(path: string, init: RequestInit = {}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const response = await fetch(supabaseUrl + "/rest/v1/" + path, {
    ...init,
    headers: serviceHeaders((init.headers || {}) as Record<string, string>)
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Supabase REST " + response.status + ": " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

async function telegram(method: string, body: unknown) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!token) throw new Error("Telegram bot token is not configured");
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("Telegram API request failed");
  return result.result;
}

async function sendMessage(chatId: number, text: string, replyMarkup?: unknown) {
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return telegram("sendMessage", body);
}

async function linkedAccount(telegramUserId: number, chatId: number) {
  const rows = await rest(
    "telegram_accounts?telegram_user_id=eq." + encodeURIComponent(String(telegramUserId)) +
    "&chat_id=eq." + encodeURIComponent(String(chatId)) + "&select=user_id,chat_id"
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function handleLink(message: any, chatId: number, telegramUserId: number, code: string) {
  if (!/^\d{6}$/.test(code)) {
    await sendMessage(chatId, "Код должен состоять из 12 символов. Получи новый код в настройках RPG-LIFE.");
    return;
  }
  const ok = await rest("rpc/link_telegram_account", {
    method: "POST",
    body: JSON.stringify({
      p_code_hash: await sha256(code),
      p_telegram_user_id: telegramUserId,
      p_chat_id: chatId,
      p_username: message.from?.username || null,
      p_first_name: message.from?.first_name || null,
      p_last_name: message.from?.last_name || null
    })
  });
  await sendMessage(chatId, ok === true
    ? "Telegram подключён к RPG-LIFE. Теперь можешь присылать отчёты о своих действиях обычным сообщением."
    : "Код недействителен, уже использован или истёк. Создай новый код в настройках RPG-LIFE.");
}

async function analyzeMessage(text: string) {
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";
  if (!groqKey) throw new Error("GROQ_API_KEY is not configured");
  const system = [
    "Ты извлекаешь фактически выполненные действия пользователя из дневникового сообщения.",
    "Верни только JSON-объект вида {\"activities\":[{\"title\":string,\"description\":string,\"category\":string,\"duration_minutes\":number,\"quantity\":number,\"unit\":string}]}",
    "Категории: study, programming, sport, creative, work, personal, other.",
    "Не выдумывай действия, длительность, количество или результаты. Не превращай планы и намерения в выполненные действия.",
    "Если в сообщении нет ни одного фактически выполненного действия, верни {\"activities\":[]}.",
    "Максимум 5 отдельных действий. Не назначай XP, уровни или награды."
  ].join("\n");
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + groqKey },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: text.slice(0, 6000) }],
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error("Groq request failed: " + response.status);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq returned no message");
  const trimmed = content.trim();
  if (trimmed === '{"activities":[]}' || trimmed === "{\n  \"activities\": []\n}") return [];
  return parseAiJson(content);
}

async function handleCallback(callback: any) {
  const data = String(callback.data || "");
  const match = /^(confirm|reject):([0-9a-f-]{36})$/i.exec(data);
  const chatId = callback.message?.chat?.id;
  const telegramUserId = callback.from?.id;
  if (!match || !isUuid(match[2]) || !chatId || !telegramUserId) {
    await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Кнопка недействительна.", show_alert: true });
    return;
  }
  const result = await rest("rpc/resolve_telegram_pending_action", {
    method: "POST",
    body: JSON.stringify({
      p_pending_id: match[2],
      p_telegram_user_id: telegramUserId,
      p_chat_id: chatId,
      p_decision: match[1]
    })
  });
  const messages: Record<string, string> = {
    not_linked: "Аккаунт Telegram не привязан.",
    not_found: "Предложение не найдено.",
    already_resolved: "Это предложение уже обработано.",
    expired: "Время подтверждения истекло. Пришли действия ещё раз.",
    save_not_found: "В облаке RPG-LIFE пока нет сохранения. Сначала открой приложение и синхронизируй прогресс."
  };
  let reply = "";
  if (result?.ok && result.status === "confirmed") {
    reply = "Записано в журнал RPG-LIFE: " + result.count + " действий. XP пока не начислялся.";
  } else if (result?.ok && result.status === "rejected") {
    reply = "Предложение отклонено. Ничего не записано.";
  } else {
    reply = messages[result?.reason] || "Не удалось обработать подтверждение.";
  }
  await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: result?.ok ? "Готово" : "Не выполнено" });
  if (chatId) await sendMessage(chatId, reply);
}

async function handleReport(chatId: number, userId: string, days: number) {
  const rows = await rest("life_rpg_saves?user_id=eq." + encodeURIComponent(userId) + "&select=data");
  const log = Array.isArray(rows?.[0]?.data?.activityLog) ? rows[0].data.activityLog : [];
  const cutoff = Date.now() - days * 86400000;
  const items = log.filter((item: any) =>
    item?.source === "telegram" && Number(item.at) >= cutoff
  ).slice(0, 20);
  if (!items.length) {
    await sendMessage(chatId, days === 1 ? "За последние 24 часа записей нет." : "За последние 7 дней записей нет.");
    return;
  }
  const lines = items.map((item: any, i: number) => (i + 1) + ". " + String(item.title || "Действие").slice(0, 120) +
    (item.result ? " — " + String(item.result).slice(0, 180) : ""));
  await sendMessage(chatId, (days === 1 ? "Действия за последние 24 часа:\n" : "Действия за последние 7 дней:\n") + lines.join("\n"));
}

async function handleMessage(message: any) {
  const chatId = message.chat?.id;
  const telegramUserId = message.from?.id;
  if (!chatId || !telegramUserId) return;
  if (message.chat?.type !== "private") {
    await sendMessage(chatId, "Используй личный чат с ботом — групповые чаты не поддерживаются.");
    return;
  }
  const text = String(message.text || "").trim();
  if (!text) {
    await sendMessage(chatId, "Пока поддерживаются текстовые отчёты. Напиши, что сделал за день.");
    return;
  }
  const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();
  if (command === "/start") {
    await sendMessage(chatId, "Я помощник RPG-LIFE.\n1) Войди в RPG-LIFE.\n2) В настройках нажми «Подключить Telegram».\n3) Отправь мне /link и 6-значный код.\n\nПосле привязки просто пиши, что сделал за день. Я покажу предложение и дождусь подтверждения.\nКоманды: /today, /report, /cancel, /unlink.");
    return;
  }
  if (command === "/link") {
    const code = text.split(/\s+/)[1] || "";
    await handleLink(message, chatId, telegramUserId, code);
    return;
  }

  const account = await linkedAccount(telegramUserId, chatId);
  if (!account) {
    await sendMessage(chatId, "Сначала привяжи аккаунт: открой настройки RPG-LIFE, получи код и отправь /link КОД.");
    return;
  }
  if (command === "/today") {
    await handleReport(chatId, account.user_id, 1);
    return;
  }
  if (command === "/report") {
    await handleReport(chatId, account.user_id, 7);
    return;
  }
  if (command === "/unlink") {
    await rest("telegram_accounts?telegram_user_id=eq." + encodeURIComponent(String(telegramUserId)), { method: "DELETE" });
    await sendMessage(chatId, "Telegram отвязан от RPG-LIFE.");
    return;
  }
  if (command === "/cancel") {
    const rows = await rest("telegram_pending_actions?user_id=eq." + encodeURIComponent(account.user_id) +
      "&status=eq.pending&select=id&order=created_at.desc&limit=1");
    if (!rows.length) {
      await sendMessage(chatId, "Нет ожидающих подтверждения предложений.");
      return;
    }
    const result = await rest("rpc/resolve_telegram_pending_action", {
      method: "POST",
      body: JSON.stringify({ p_pending_id: rows[0].id, p_telegram_user_id: telegramUserId, p_chat_id: chatId, p_decision: "reject" })
    });
    await sendMessage(chatId, result?.ok ? "Последнее предложение отменено." : "Не удалось отменить предложение.");
    return;
  }

  const activities = await analyzeMessage(text);
  if (!activities.length) {
    await sendMessage(chatId, "Не нашёл конкретных выполненных действий. Напиши, что именно уже сделал, а не планируешь сделать.");
    return;
  }
  const pendingRows = await rest("telegram_pending_actions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: account.user_id,
      telegram_user_id: telegramUserId,
      chat_id: chatId,
      source_message_id: message.message_id || null,
      proposal: activities,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    })
  });
  const pending = pendingRows?.[0];
  if (!pending?.id) throw new Error("Could not save pending Telegram proposal");
  const preview = formatProposal(activities);
  await sendMessage(chatId,
    "Я распознал следующие действия:\n\n" + preview +
    "\n\nПодтвердить запись? Ничего не будет сохранено до нажатия кнопки. Предложение действует 30 минут. XP за эти записи не начисляется.",
    { inline_keyboard: [[
      { text: "Подтвердить запись", callback_data: "confirm:" + pending.id },
      { text: "Отклонить", callback_data: "reject:" + pending.id }
    ]] }
  );
}

async function processUpdate(update: any) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = readDefaultKeyMap("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !getServiceKey()) return json({ error: "Supabase server configuration is incomplete" }, 503);

  let body: any;
  try {
    body = await readJson(req);
  } catch {
    return json({ error: "Invalid or oversized JSON body" }, 400);
  }

  if (body?.action === "create_link") {
    try {
      return await createLinkCode(req, supabaseUrl, anonKey);
    } catch (error) {
      console.error("Telegram link-code creation failed", error);
      return json({ error: "Не удалось создать код привязки." }, 503);
    }
  }

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!expectedSecret || !constantTimeEqual(receivedSecret, expectedSecret)) {
    return json({ error: "Unauthorized webhook" }, 401);
  }
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!botToken) return json({ error: "Telegram bot is not configured" }, 503);
  if (!body || !Number.isSafeInteger(body.update_id)) return json({ ok: true });

  try {
    const inserted = await rest("telegram_webhook_updates?on_conflict=update_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ update_id: body.update_id })
    });
    if (!Array.isArray(inserted) || inserted.length === 0) return json({ ok: true, duplicate: true });
    await processUpdate(body);
    return json({ ok: true });
  } catch (error) {
    console.error("Telegram update processing failed", error);
    return json({ ok: false }, 500);
  }
});
