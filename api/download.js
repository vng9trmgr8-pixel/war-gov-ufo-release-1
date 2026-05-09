/**
 * Vercel Serverless Function (Node.js) — proxies a single asset download
 * from war.gov so the browser can save it via Content-Disposition.
 *
 * Cross-origin <a download> doesn't trigger a real download (browsers
 * navigate instead) and fetch() to war.gov is CORS-blocked, which is why
 * the proxy is necessary.
 *
 * Note: Vercel's Edge Runtime fetch is blocked by war.gov's Akamai (TLS or
 * IP heuristics). Node serverless fetch works.
 */
const ALLOWED_HOSTS = new Set(["www.war.gov", "war.gov"]);

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,application/pdf,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  referer: "https://www.war.gov/ufo/",
};

module.exports = async function handler(req, res) {
  const target = (req.query && req.query.url) || "";
  const nameParam = (req.query && req.query.name) || "";

  if (!target) {
    res.status(400).send("missing ?url");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).send("invalid url");
    return;
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).send("only war.gov urls allowed");
    return;
  }

  let upstream;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
  } catch (err) {
    res.status(502).send("upstream fetch failed: " + (err && err.message));
    return;
  }

  if (!upstream.ok) {
    res
      .status(upstream.status)
      .send("upstream " + upstream.status + " " + upstream.statusText);
    return;
  }

  const filename = (nameParam || parsed.pathname.split("/").pop() || "file")
    .replace(/[\r\n"\\]/g, "")
    .slice(0, 200);

  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  res.setHeader("Content-Type", ct);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const cl = upstream.headers.get("content-length");
  if (cl) res.setHeader("Content-Length", cl);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("X-Proxied-From", parsed.hostname);

  // Stream the body to the response
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(Buffer.from(value))) {
      await new Promise((r) => res.once("drain", r));
    }
  }
  res.end();
};

module.exports.config = { maxDuration: 300 };
