// ../yintai-queue/app/api/queue/route.ts
import { env } from "../postgres-env.mjs";
var e = env;
var json = (d, status = 200, headers = {}) => Response.json(d, { status, headers: { "Cache-Control": "no-store", ...headers } });
function device(req) {
  return req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith("paint_device="))?.split("=")[1] || null;
}
function isOpen() {
  return e.QUEUE_DEMO === "true" || Date.now() >= Date.parse("2026-11-01T13:00:00+08:00") && Date.now() < Date.parse("2026-11-01T19:00:00+08:00");
}
async function advance() {
  let now = Date.now();
  await e.DB.batch([e.DB.prepare("UPDATE tickets SET status='missed',finished=? WHERE status='called' AND called<=?").bind(now, now - 3e5), e.DB.prepare("UPDATE tickets SET status='called',called=? WHERE id=(SELECT MIN(id) FROM tickets WHERE status='waiting') AND NOT EXISTS(SELECT 1 FROM tickets WHERE status IN ('called','serving')) AND EXISTS(SELECT 1 FROM tickets WHERE status='missed' AND finished=?)").bind(now, now)]);
}
async function GET(req) {
  try {
    await advance();
    let rows = (await e.DB.prepare("SELECT * FROM tickets ORDER BY id").all()).results;
    let mine = rows.find((t) => t.device === device(req));
    let safe = (t) => ({ id: t.id, kind: t.kind, status: t.status, called: t.called });
    return json({ tickets: rows.map(safe), mine: mine ? safe(mine) : null, counts: { basic: rows.filter((t) => t.kind === "basic").length, complex: rows.filter((t) => t.kind === "complex").length }, now: Date.now(), open: isOpen(), demo: e.QUEUE_DEMO === "true" });
  } catch {
    return json({ error: "\u961F\u5217\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0" }, 503);
  }
}
async function POST(req) {
  try {
    if (req.headers.get("origin") && new URL(req.url).origin !== req.headers.get("origin")) return json({ error: "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548" }, 403);
    let b = await req.json();
    let d = device(req) || crypto.randomUUID(), cookie = { "Set-Cookie": `paint_device=${d}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${new URL(req.url).protocol === "https:" ? "; Secure" : ""}` };
    const adminActions = ["login", "next", "start", "finish", "issue", "recall"];
    if (adminActions.includes(b.action) && (!e.ADMIN_KEY || req.headers.get("authorization") !== "Bearer " + e.ADMIN_KEY)) return json({ error: "\u7BA1\u7406\u5BC6\u7801\u4E0D\u6B63\u786E" }, 401);
    if (b.action === "login") return json({ ok: true });
    await advance();
    if (b.action === "join" || b.action === "issue") {
      if (!isOpen()) return json({ error: "\u5F53\u524D\u5C1A\u672A\u5F00\u653E\u9886\u53F7\uFF0C\u6D3B\u52A8\u65F6\u95F4\u4E3A11\u67081\u65E513:00\u201419:00" }, 409);
      let kind = b.action === "join" ? "basic" : "complex", limit = kind === "basic" ? 60 : 15, code = kind === "complex" ? crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase() : null;
      if (kind === "basic" && await e.DB.prepare("SELECT id FROM tickets WHERE device=?").bind(d).first()) return json({ error: "\u4F60\u5DF2\u7ECF\u9886\u8FC7\u53F7\uFF0C\u8BF7\u67E5\u770B\u5F53\u524D\u53F7\u7801" }, 409);
      let r = await e.DB.prepare("INSERT INTO tickets(device,kind,status,created,code) SELECT ?,?,'waiting',?,? WHERE (SELECT COUNT(*) FROM tickets WHERE kind=?)<? RETURNING id").bind(kind === "basic" ? d : null, kind, Date.now(), code, kind, limit).first();
      if (!r) return json({ error: "\u8BE5\u6B3E\u5F0F\u540D\u989D\u5DF2\u9886\u5B8C" }, 409);
      return json({ ok: true, code }, 200, kind === "basic" ? cookie : {});
    }
    if (b.action === "claim") {
      if (await e.DB.prepare("SELECT id FROM tickets WHERE device=?").bind(d).first()) return json({ error: "\u8FD9\u53F0\u624B\u673A\u5DF2\u7ED1\u5B9A\u53F7\u7801" }, 409);
      let r = await e.DB.prepare("UPDATE tickets SET device=?,code=NULL WHERE code=? AND device IS NULL RETURNING id").bind(d, String(b.code || "").trim().toUpperCase()).first();
      return r ? json({ ok: true }, 200, cookie) : json({ error: "\u9886\u53D6\u7801\u65E0\u6548\u6216\u5DF2\u88AB\u4F7F\u7528" }, 409);
    }
    if (b.action === "next") {
      if (await e.DB.prepare("SELECT id FROM tickets WHERE status IN ('called','serving')").first()) return json({ error: "\u8BF7\u5148\u5B8C\u6210\u5F53\u524D\u670D\u52A1\u6216\u7B49\u5F85\u8FC7\u53F7" }, 409);
      await e.DB.prepare("UPDATE tickets SET status='called',called=? WHERE id=(SELECT MIN(id) FROM tickets WHERE status='waiting') AND NOT EXISTS(SELECT 1 FROM tickets WHERE status IN ('called','serving'))").bind(Date.now()).run();
    } else if (b.action === "start") {
      let r = await e.DB.prepare("UPDATE tickets SET status='serving',started=? WHERE id=? AND status='called' RETURNING id").bind(Date.now(), b.id).first();
      if (!r) return json({ error: "\u53F7\u7801\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0" }, 409);
    } else if (b.action === "finish") {
      await e.DB.batch([e.DB.prepare("UPDATE tickets SET status='done',finished=? WHERE id=? AND status='serving'").bind(Date.now(), b.id), e.DB.prepare("UPDATE tickets SET status='called',called=? WHERE id=(SELECT MIN(id) FROM tickets WHERE status='waiting') AND NOT EXISTS(SELECT 1 FROM tickets WHERE status IN ('called','serving'))").bind(Date.now())]);
    } else if (b.action === "recall") {
      let r = await e.DB.prepare("UPDATE tickets SET status='called',called=? WHERE id=? AND status='missed' AND NOT EXISTS(SELECT 1 FROM tickets WHERE status IN ('called','serving')) RETURNING id").bind(Date.now(), b.id).first();
      if (!r) return json({ error: "\u8865\u53EB\u9700\u7B49\u5F85\u5F53\u524D\u670D\u52A1\u7ED3\u675F" }, 409);
    } else {
      return json({ error: "\u64CD\u4F5C\u65E0\u6548" }, 400);
    }
    return json({ ok: true });
  } catch {
    return json({ error: "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u5237\u65B0\u67E5\u770B\u53F7\u7801\u72B6\u6001\u540E\u91CD\u8BD5" }, 500);
  }
}
export {
  GET,
  POST
};
