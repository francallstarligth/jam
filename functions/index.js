// Cloudflare Pages Function: pone nombre y cancion del jam en la vista previa (sin la imagen de IA)
const GENERIC_TITLE = "Te invitaron a un jam";
const GENERIC_DESC = "Toca para escuchar juntos en Eclipse";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function meta(html, prop) {
  const tags = html.match(/<meta[^>]+>/gi) || [];
  for (const t of tags) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t);
    if (key && key[1].toLowerCase() === prop) {
      const c = /content\s*=\s*"([^"]*)"/i.exec(t) || /content\s*=\s*'([^']*)'/i.exec(t);
      if (c) return c[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    }
  }
  return "";
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = (url.searchParams.get("id") || "").replace(/[^A-Za-z0-9_-]/g, "");
  const debug = url.searchParams.get("debug") === "1";

  let title = GENERIC_TITLE, desc = GENERIC_DESC, image = "";
  let dbg = { id, status: null, ogTitle: "", ogDesc: "", ogImage: "", error: "" };

  const sid = (url.searchParams.get("s") || "").replace(/[^A-Za-z0-9_-]/g, "");
  const wantImg = url.searchParams.get("img") === "1";
  dbg.sid = sid; dbg.source = "";

  async function leer(u) {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; JamLink/1.0)", "Accept": "text/html" } });
    const html = await r.text();
    return { status: r.status, ogTitle: meta(html, "og:title"), ogDesc: meta(html, "og:description"), ogImage: meta(html, "og:image") };
  }

  if (id || sid) {
    try {
      // 1) la pagina del enlace corto /s/ (trae el nombre y la cancion); 2) si no hay, la del jam
      const fuente = sid ? "https://eclipsemusic.app/s/" + sid : "https://api.eclipsemusic.app/api/jam/" + id;
      const d = await leer(fuente);
      dbg.source = fuente; dbg.status = d.status;
      dbg.ogTitle = d.ogTitle; dbg.ogDesc = d.ogDesc; dbg.ogImage = d.ogImage;

      const m = /^(.+?) invited you to jam$/i.exec(d.ogTitle);
      if (m && m[1].toLowerCase() !== "someone") title = m[1] + " te invita a su jam";

      if (d.ogDesc && !/^Listen together on Eclipse Music$/i.test(d.ogDesc)) {
        desc = d.ogDesc.replace(/^Now playing:\s*/i, "Sonando: ").replace(/\s*[|\u2022]\s*Join on Eclipse( Music)?$/i, "");
      }
      // La imagen por defecto de Eclipse (la de IA) NUNCA se usa; la tarjeta propia solo si el enlace trae &img=1
      if (d.ogImage && !/jam_invite/i.test(d.ogImage) && wantImg) image = d.ogImage;
    } catch (e) {
      dbg.error = String(e);
    }
  }

  if (debug) return new Response(JSON.stringify({ title, desc, image, ...dbg }, null, 2), { headers: { "content-type": "application/json; charset=utf-8" } });

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary">\n<meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center; background: #0d0d10; color: #f2f2f5; font-family: system-ui, sans-serif; text-align: center; padding: 24px; box-sizing: border-box; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  p { color: #a8a8b3; margin: 0 0 28px; }
  a.btn { display: inline-block; background: #fff; color: #000; font-weight: 700; font-size: 1.2rem; padding: 18px 36px; border-radius: 999px; text-decoration: none; }
  a.btn[aria-disabled="true"] { opacity: .4; pointer-events: none; }
  #msg { margin-top: 20px; font-size: .9rem; color: #a8a8b3; }
</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p>${esc(desc)}</p>
  <a id="go" class="btn" href="#" aria-disabled="true">Unirse al jam</a>
  <div id="msg"></div>
</main>
<script>
(function () {
  var id = ${JSON.stringify(id)};
  var btn = document.getElementById("go");
  var msg = document.getElementById("msg");
  if (!id) { msg.textContent = "Este enlace no trae el código del jam."; return; }
  var url = "debridmusic://jam?id=" + id;
  btn.href = url;
  btn.removeAttribute("aria-disabled");
  msg.textContent = "Si no se abre solo, toca el botón.";
  setTimeout(function () { location.href = url; }, 400);
})();
</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
}
