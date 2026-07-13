// Telegram bot: send a floor-plan PDF (or type an area) → get an estimate with
// interactive edit buttons. /link connects an app account for live market
// prices and the supplier directory (Pro).
import {
  getUser,
  hashPassword,
  isPro,
  normEmail,
  type EventContext as BaseEventContext,
  type Env as BaseEnv,
  type SupplierListing,
  type UserRecord,
} from "../_lib";
import { computeEstimate, formatNaira } from "../../src/engine/estimate";
import {
  DEFAULT_PRICES,
  FOUNDATION_TYPES,
  POOL_SIZES,
  ROOF_TYPES,
  SITE_ADDONS,
  STATES,
  STATE_SOIL,
  SUBTYPES,
} from "../../src/engine/data";
import type { BuildingType, UnitPrices } from "../../src/engine/data";
import { extractPlanFromDoc } from "../../src/engine/planCore";
import type { PdfDocLike } from "../../src/engine/planCore";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

interface Env extends BaseEnv {
  TELEGRAM_BOT_TOKEN?: string;
}
interface EventContext extends Omit<BaseEventContext, "env"> {
  env: Env;
}

interface TgParams {
  area: number | null; // footprint per floor, sqm
  storeys: number;
  state: string;
  buildingType: BuildingType;
  subtype: string;
  foundationType: string;
  roofType: string;
  poolSize: string;
  addons: string[];
  contingencyPct: number;
}

interface TgSession {
  email?: string;
  supFilter?: string;
  p: TgParams;
}

const DEFAULT_PARAMS: TgParams = {
  area: null,
  storeys: 0,
  state: "Lagos",
  buildingType: "residential",
  subtype: "bungalow",
  foundationType: STATE_SOIL["Lagos"].foundation,
  roofType: "pitched_gable",
  poolSize: "",
  addons: [],
  contingencyPct: 10,
};

const ok = () => new Response("ok");

async function tg(env: Env, method: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const send = (env: Env, chatId: number, text: string, keyboard?: unknown) =>
  tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });

async function loadSession(env: Env, chatId: number): Promise<TgSession> {
  const raw = await env.PRICES_KV.get(`tg:${chatId}`);
  if (!raw) return { p: { ...DEFAULT_PARAMS } };
  try {
    const s = JSON.parse(raw) as TgSession;
    return { ...s, p: { ...DEFAULT_PARAMS, ...s.p } };
  } catch {
    return { p: { ...DEFAULT_PARAMS } };
  }
}

const saveSession = (env: Env, chatId: number, s: TgSession) => env.PRICES_KV.put(`tg:${chatId}`, JSON.stringify(s));

async function linkedUser(env: Env, s: TgSession): Promise<UserRecord | null> {
  return s.email ? getUser(env.PRICES_KV, s.email) : null;
}

async function marketPrices(env: Env, state: string, pro: boolean): Promise<{ prices: UnitPrices; updatedAt: string | null }> {
  if (!pro) return { prices: DEFAULT_PRICES, updatedAt: null };
  const clean = state.replace(/[^a-z ]/gi, "").trim().toLowerCase();
  const stored = (clean ? await env.PRICES_KV.get(`prices:${clean}`) : null) ?? (await env.PRICES_KV.get("prices"));
  if (!stored) return { prices: DEFAULT_PRICES, updatedAt: null };
  try {
    const { prices, updatedAt } = JSON.parse(stored) as { prices: Partial<UnitPrices>; updatedAt: string | null };
    return { prices: { ...DEFAULT_PRICES, ...prices }, updatedAt };
  } catch {
    return { prices: DEFAULT_PRICES, updatedAt: null };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mainKeyboard(p: TgParams) {
  return [
    [
      { text: `📍 ${p.state}`, callback_data: "m:state" },
      { text: `🏢 Storeys: ${p.storeys}`, callback_data: "m:storeys" },
    ],
    [
      { text: `🏠 ${p.subtype}`, callback_data: "m:type" },
      { text: "🧱 Foundation", callback_data: "m:found" },
    ],
    [
      { text: "🏠 Roof", callback_data: "m:roof" },
      { text: `🏊 Pool${p.poolSize ? ": " + p.poolSize : ""}`, callback_data: "m:pool" },
    ],
    [
      { text: `➕ Add-ons (${p.addons.length})`, callback_data: "m:addons" },
      { text: `🛡️ Buffer: ${p.contingencyPct}%`, callback_data: "m:cont" },
    ],
    [{ text: "🏪 Suppliers", callback_data: "sup:list" }],
  ];
}

async function estimateText(env: Env, s: TgSession): Promise<string> {
  const p = s.p;
  if (!p.area) {
    return "Send me a floor-plan PDF, or type the floor area in sqm (e.g. <code>250</code>) to get an estimate.";
  }
  const user = await linkedUser(env, s);
  const pro = isPro(user);
  const { prices, updatedAt } = await marketPrices(env, p.state, pro);
  const r = computeEstimate({
    buildingType: p.buildingType,
    subtype: p.subtype,
    floorArea: p.area,
    storeys: p.storeys,
    columns: 0,
    state: p.state,
    blockPrice: 750,
    stages: ["full"],
    prices,
    foundationType: p.foundationType,
    roofType: p.roofType,
    poolSize: p.poolSize,
    siteAddons: p.addons,
    contingencyPct: p.contingencyPct,
  });
  const soil = STATE_SOIL[p.state];
  const lines = [
    `<b>🏗️ Estimate — ${esc(p.subtype)} · ${p.state}</b>`,
    `${p.area} sqm · ${p.storeys === 0 ? "bungalow" : `${p.storeys} storey${p.storeys > 1 ? "s" : ""}`} · ${r.quantities.totalBuiltArea} sqm built`,
    "",
    `<b>Total: ${formatNaira(r.grandTotal)}</b>`,
    `(works ${formatNaira(r.total)} + ${p.contingencyPct}% buffer ${formatNaira(r.contingency)})`,
    "",
    "<b>Trades</b>",
    ...r.trades.map((t) => `${t.icon} ${esc(t.label)}: ${formatNaira(t.total)}`),
    "",
    `<b>Key quantities</b>: ${r.quantities.cementBags.toLocaleString()} cement bags · ${r.quantities.steelTonnes}t steel · ${r.quantities.blocks.toLocaleString()} blocks`,
  ];
  if (soil && soil.foundation === p.foundationType) {
    lines.push(`🧱 Foundation: ${esc(FOUNDATION_TYPES.find((f) => f.value === p.foundationType)?.label ?? p.foundationType)} (recommended for ${p.state})`);
  }
  lines.push(
    updatedAt
      ? `📈 Market prices as of ${new Date(updatedAt).toLocaleDateString("en-GB")}`
      : pro
        ? "Using default prices (none published yet)"
        : "Using default prices — /link your Pro account for live market prices",
  );
  lines.push("", "Tap a button below to adjust — the estimate recalculates instantly.");
  return lines.join("\n");
}

async function sendEstimate(env: Env, chatId: number, s: TgSession, editMessageId?: number) {
  const text = await estimateText(env, s);
  const kb = s.p.area ? mainKeyboard(s.p) : undefined;
  if (editMessageId) {
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: editMessageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}),
    });
  } else {
    await send(env, chatId, text, kb);
  }
}

async function suppliersText(env: Env, s: TgSession): Promise<{ text: string; kb?: unknown }> {
  const user = await linkedUser(env, s);
  if (!user) {
    return {
      text: "🏪 The supplier directory needs your app account.\nLink it with:\n<code>/link email password</code>\n\nNo account yet? Sign up at https://naija-build-estimator.pages.dev",
    };
  }
  if (!isPro(user) && user.role !== "supplier") {
    return { text: "🔒 The supplier directory is a Pro feature — upgrade in the app (Account tab) and try again." };
  }
  const list = await env.PRICES_KV.list?.({ prefix: "slisting:" });
  const listings: SupplierListing[] = [];
  for (const k of list?.keys ?? []) {
    const raw = await env.PRICES_KV.get(k.name);
    if (!raw) continue;
    try {
      const listing = JSON.parse(raw) as SupplierListing;
      const owner = await getUser(env.PRICES_KV, listing.email);
      if (!owner?.supplierApproved || owner.locked) continue;
      listings.push(listing);
    } catch {
      /* skip bad records */
    }
  }
  listings.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const filtered = s.supFilter ? listings.filter((l) => l.state === s.supFilter) : listings;
  if (!filtered.length) {
    return { text: `🏪 No supplier listings${s.supFilter ? ` in ${s.supFilter}` : ""} yet — check back soon.` };
  }
  const blocks = filtered.slice(0, 10).map((l) => {
    const wa = l.whatsapp.replace(/[^0-9]/g, "").replace(/^0/, "234");
    const items = l.items.map((it) => `  • ${esc(it.material)} (${esc(it.unit)}): ${formatNaira(it.price)}`).join("\n");
    return `<b>${esc(l.businessName)}</b> — 📍 ${esc(l.state)}\nUpdated ${new Date(l.updatedAt).toLocaleDateString("en-GB")}\n${items}\n💬 <a href="https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${l.businessName}, I found you on Naija Build Estimator and would like to enquire about your material prices.`)}">Contact on WhatsApp</a>`;
  });
  const states = [...new Set(listings.map((l) => l.state))];
  const kb = [
    [{ text: s.supFilter ? `🌍 All states` : `✅ All states`, callback_data: "sup:f:" }],
    ...states.map((st) => [{ text: `${s.supFilter === st ? "✅ " : ""}📍 ${st}`, callback_data: `sup:f:${st}` }]),
    ...(s.p.area ? [[{ text: "⬅️ Back to estimate", callback_data: "show:est" }]] : []),
  ];
  return { text: `<b>🏪 Supplier Marketplace</b> — freshest first\n\n${blocks.join("\n\n")}`, kb };
}

async function handleDocument(env: Env, chatId: number, s: TgSession, doc: { file_id: string; file_name?: string; mime_type?: string; file_size?: number }) {
  const name = (doc.file_name ?? "").toLowerCase();
  if (doc.mime_type !== "application/pdf" && !name.endsWith(".pdf")) {
    await send(env, chatId, "Please send the floor plan as a PDF — images can't be read (no text layer).");
    return;
  }
  if ((doc.file_size ?? 0) > 19 * 1024 * 1024) {
    await send(env, chatId, "That file is too large (max 20 MB). Try exporting just the floor-plan sheets.");
    return;
  }
  await send(env, chatId, "📐 Reading your plan…");
  const info = (await tg(env, "getFile", { file_id: doc.file_id })) as { ok?: boolean; result?: { file_path?: string } } | null;
  const path = info?.result?.file_path;
  if (!path) {
    await send(env, chatId, "Couldn't download that file from Telegram — please try again.");
    return;
  }
  try {
    const buf = await (await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`)).arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { OPS } = await getResolvedPDFJS();
    const plan = await extractPlanFromDoc(pdf as unknown as PdfDocLike, OPS.constructPath);
    if (!plan.areaSqm) {
      await send(env, chatId, "Couldn't detect a floor area on that plan — type the area in sqm instead (e.g. <code>250</code>).");
      return;
    }
    s.p.area = plan.areaSqm;
    if (plan.floors) s.p.storeys = Math.min(plan.floors - 1, 10);
    if (plan.hasPool && !s.p.poolSize) s.p.poolSize = "medium";
    await saveSession(env, chatId, s);
    await send(
      env,
      chatId,
      `✅ Detected ${plan.areaSqm} sqm${plan.floors ? ` · ${plan.floors} floor${plan.floors > 1 ? "s" : ""}` : ""}${plan.hasPool ? " · 🏊 pool on plan (added)" : ""}`,
    );
    await sendEstimate(env, chatId, s);
  } catch {
    await send(env, chatId, "Couldn't read that PDF — it may be a scanned image with no text layer. Type the area in sqm instead.");
  }
}

const WELCOME = [
  "<b>👋 Welcome to Naija Build Estimator</b>",
  "",
  "I estimate Nigerian construction costs from your floor plan:",
  "📄 Send a floor-plan <b>PDF</b> — I'll detect the area, floors and pool",
  "🔢 Or just type the floor area in sqm (e.g. <code>250</code>)",
  "",
  "Then use the buttons to adjust state, storeys, foundation, add-ons — the estimate updates instantly.",
  "",
  "<b>Commands</b>",
  "/estimate — show your current estimate",
  "/suppliers — daily material prices from verified suppliers (Pro)",
  "/link email password — connect your app account (live market prices)",
  "/reset — start a fresh estimate",
].join("\n");

async function handleText(env: Env, chatId: number, s: TgSession, text: string, messageId: number) {
  const t = text.trim();
  if (t.startsWith("/start") || t.startsWith("/help")) {
    await send(env, chatId, WELCOME);
    return;
  }
  if (t.startsWith("/reset")) {
    s.p = { ...DEFAULT_PARAMS };
    await saveSession(env, chatId, s);
    await send(env, chatId, "🔄 Fresh estimate — send a floor-plan PDF or type the area in sqm.");
    return;
  }
  if (t.startsWith("/estimate") || t.startsWith("/menu")) {
    await sendEstimate(env, chatId, s);
    return;
  }
  if (t.startsWith("/suppliers")) {
    const { text: st, kb } = await suppliersText(env, s);
    await send(env, chatId, st, kb);
    return;
  }
  if (t.startsWith("/unlink")) {
    delete s.email;
    await saveSession(env, chatId, s);
    await send(env, chatId, "Account unlinked.");
    return;
  }
  if (t.startsWith("/link")) {
    // Delete the message so the password doesn't linger in the chat.
    await tg(env, "deleteMessage", { chat_id: chatId, message_id: messageId });
    const [, emailRaw, ...pw] = t.split(/\s+/);
    const email = normEmail(emailRaw);
    const password = pw.join(" ");
    if (!email || !password) {
      await send(env, chatId, "Usage: <code>/link email password</code>");
      return;
    }
    const user = await getUser(env.PRICES_KV, email);
    if (!user || (await hashPassword(password, user.salt)) !== user.hash) {
      await send(env, chatId, "❌ Incorrect email or password.");
      return;
    }
    if (user.locked) {
      await send(env, chatId, "🔒 That account is locked — contact your administrator.");
      return;
    }
    s.email = email;
    await saveSession(env, chatId, s);
    const pro = isPro(user);
    await send(
      env,
      chatId,
      `✅ Linked <b>${esc(email)}</b> (${pro ? "Pro ⭐ — live market prices & supplier directory enabled" : "Free plan — upgrade in the app for live prices & suppliers"}).`,
    );
    return;
  }
  const n = parseFloat(t.replace(/,/g, ""));
  if (isFinite(n) && n >= 10 && n <= 100000) {
    s.p.area = Math.round(n);
    await saveSession(env, chatId, s);
    await sendEstimate(env, chatId, s);
    return;
  }
  await send(env, chatId, "Send a floor-plan PDF, type the floor area in sqm (e.g. <code>250</code>), or /help for commands.");
}

function optionMenu(data: string, p: TgParams): { text: string; kb: unknown } | null {
  const back = [{ text: "⬅️ Back", callback_data: "show:est" }];
  switch (data) {
    case "m:state": {
      const rows = [];
      for (let i = 0; i < STATES.length; i += 3) {
        rows.push(
          STATES.slice(i, i + 3).map((st, j) => ({
            text: `${p.state === st ? "✅ " : ""}${st}`,
            callback_data: `set:state:${i + j}`,
          })),
        );
      }
      rows.push(back);
      return { text: "📍 <b>Choose your state</b> — labour, logistics and soil-based foundation adjust automatically.", kb: rows };
    }
    case "m:storeys": {
      const rows = [];
      for (let i = 0; i <= 9; i += 5) {
        rows.push(
          Array.from({ length: 5 }, (_, j) => i + j).map((n) => ({
            text: `${p.storeys === n ? "✅ " : ""}${n}`,
            callback_data: `set:storeys:${n}`,
          })),
        );
      }
      rows.push(back);
      return { text: "🏢 <b>Number of storeys</b> (0 = bungalow, ground floor only)", kb: rows };
    }
    case "m:type": {
      const rows = (["residential", "commercial"] as BuildingType[]).flatMap((bt) =>
        SUBTYPES[bt].map((st) => [
          {
            text: `${p.subtype === st.value ? "✅ " : ""}${bt === "commercial" ? "🏢" : "🏠"} ${st.label}`,
            callback_data: `set:type:${bt}:${st.value}`,
          },
        ]),
      );
      rows.push(back);
      return { text: "🏠 <b>Building type</b> — picking one also sets the typical storeys (you can change them after).", kb: rows };
    }
    case "m:found": {
      const soil = STATE_SOIL[p.state];
      const rows = FOUNDATION_TYPES.map((f) => [
        {
          text: `${p.foundationType === f.value ? "✅ " : ""}${f.label}${soil?.foundation === f.value ? " ★" : ""}`,
          callback_data: `set:found:${f.value}`,
        },
      ]);
      rows.push(back);
      return {
        text: `🧱 <b>Foundation type</b>${soil ? `\n${esc(soil.soil)} in ${p.state} — ${esc(soil.note)}` : ""}`,
        kb: rows,
      };
    }
    case "m:roof": {
      const rows = ROOF_TYPES.map((r) => [
        { text: `${p.roofType === r.value ? "✅ " : ""}${r.label}`, callback_data: `set:roof:${r.value}` },
      ]);
      rows.push(back);
      return { text: "🏠 <b>Roof type</b>", kb: rows };
    }
    case "m:pool": {
      const rows = POOL_SIZES.map((ps) => [
        { text: `${p.poolSize === ps.value ? "✅ " : ""}${ps.label}`, callback_data: `set:pool:${ps.value}` },
      ]);
      rows.push(back);
      return { text: "🏊 <b>Swimming pool</b> — reinforced shell, tiling, pump & filtration", kb: rows };
    }
    case "m:addons": {
      const rows = SITE_ADDONS.map((a) => [
        { text: `${p.addons.includes(a.key) ? "✅" : "▫️"} ${a.icon} ${a.label}`, callback_data: `tog:addon:${a.key}` },
      ]);
      rows.push(back);
      return { text: "➕ <b>Site preparation & utilities</b> — tap to toggle", kb: rows };
    }
    case "m:cont": {
      const rows = [
        [0, 5, 10, 15, 20].map((n) => ({
          text: `${p.contingencyPct === n ? "✅ " : ""}${n}%`,
          callback_data: `set:cont:${n}`,
        })),
        back,
      ];
      return { text: "🛡️ <b>Contingency / inflation buffer</b> — Naira prices move fast; 10% is typical.", kb: rows };
    }
  }
  return null;
}

async function handleCallback(env: Env, cb: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } }) {
  const data = cb.data ?? "";
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  const s = await loadSession(env, chatId);
  const p = s.p;
  let refreshEstimate = false;
  let reopenMenu: string | null = null;

  if (data === "show:est") {
    refreshEstimate = true;
  } else if (data.startsWith("m:")) {
    const menu = optionMenu(data, p);
    if (menu) {
      await tg(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: menu.kb },
      });
    }
  } else if (data.startsWith("set:state:")) {
    const st = STATES[parseInt(data.slice(10), 10)];
    if (st) {
      p.state = st;
      const soil = STATE_SOIL[st];
      if (soil) p.foundationType = soil.foundation;
    }
    refreshEstimate = true;
  } else if (data.startsWith("set:storeys:")) {
    p.storeys = Math.max(0, Math.min(10, parseInt(data.slice(12), 10) || 0));
    refreshEstimate = true;
  } else if (data.startsWith("set:type:")) {
    const [bt, sub] = data.slice(9).split(":");
    if (bt === "residential" || bt === "commercial") {
      p.buildingType = bt;
      const st = SUBTYPES[bt].find((x) => x.value === sub);
      if (st) {
        p.subtype = st.value;
        p.storeys = st.storeys;
      }
    }
    refreshEstimate = true;
  } else if (data.startsWith("set:found:")) {
    p.foundationType = data.slice(10);
    refreshEstimate = true;
  } else if (data.startsWith("set:roof:")) {
    p.roofType = data.slice(9);
    refreshEstimate = true;
  } else if (data.startsWith("set:pool:")) {
    p.poolSize = data.slice(9);
    refreshEstimate = true;
  } else if (data.startsWith("tog:addon:")) {
    const key = data.slice(10);
    p.addons = p.addons.includes(key) ? p.addons.filter((k) => k !== key) : [...p.addons, key];
    reopenMenu = "m:addons";
  } else if (data.startsWith("set:cont:")) {
    p.contingencyPct = Math.max(0, Math.min(50, parseInt(data.slice(9), 10) || 0));
    refreshEstimate = true;
  } else if (data === "sup:list" || data.startsWith("sup:f:")) {
    if (data.startsWith("sup:f:")) s.supFilter = data.slice(6) || undefined;
    await saveSession(env, chatId, s);
    const { text, kb } = await suppliersText(env, s);
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}),
    });
  }

  await saveSession(env, chatId, s);
  if (refreshEstimate) {
    await sendEstimate(env, chatId, s, messageId);
  } else if (reopenMenu) {
    const menu = optionMenu(reopenMenu, p);
    if (menu) {
      await tg(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: menu.kb },
      });
    }
  }
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
}

export async function onRequestPost(ctx: EventContext): Promise<Response> {
  const env = ctx.env;
  if (!env.TELEGRAM_BOT_TOKEN) return ok();
  // Telegram is configured (setWebhook secret_token) to echo the admin key hash;
  // reject anything that doesn't carry it.
  const secret = ctx.request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  const expected = env.TELEGRAM_BOT_TOKEN.slice(-16).replace(/[^A-Za-z0-9]/g, "");
  if (secret !== expected) return ok();

  let update: {
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
      document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
      photo?: unknown[];
    };
    callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } };
  };
  try {
    update = await ctx.request.json();
  } catch {
    return ok();
  }

  try {
    if (update.callback_query) {
      await handleCallback(env, update.callback_query);
    } else if (update.message) {
      const m = update.message;
      const chatId = m.chat.id;
      const s = await loadSession(env, chatId);
      if (m.document) {
        await handleDocument(env, chatId, s, m.document);
      } else if (m.photo) {
        await send(env, chatId, "Photos can't be read (no text layer) — please send the floor plan as a PDF, or type the area in sqm.");
      } else if (m.text) {
        await handleText(env, chatId, s, m.text, m.message_id);
      }
    }
  } catch {
    // Never let Telegram retry-loop on an error.
  }
  return ok();
}
