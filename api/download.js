/**
 * Vercel Edge Function — proxies a single asset download from war.gov.
 *
 * Used by the DOWNLOAD ALL button. The browser cannot fetch war.gov directly
 * (CORS-blocked), and cross-origin <a download> doesn't trigger a download
 * (browser navigates to the resource instead). Streaming the response through
 * this same-origin proxy lets us set Content-Disposition: attachment so the
 * browser saves the file to the user's Downloads folder.
 */
export const config = { runtime: "edge" };

const ALLOWED_HOSTS = new Set([
  "www.war.gov",
  "war.gov",
]);

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,application/pdf,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.war.gov/ufo/",
};

export default async function handler(req) {
  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get("url");
  const nameParam = reqUrl.searchParams.get("name");

  if (!target) {
    return new Response("missing ?url", { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response("only war.gov urls allowed", { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
  } catch (err) {
    return new Response("upstream fetch failed: " + (err && err.message), {
      status: 502,
    });
  }

  if (!upstream.ok) {
    return new Response(
      "upstream " + upstream.status + " " + upstream.statusText,
      { status: upstream.status },
    );
  }

  const filename = (nameParam || parsed.pathname.split("/").pop() || "file")
    .replace(/[\r\n"\\]/g, "")
    .slice(0, 200);

  const headers = new Headers();
  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  headers.set("Content-Type", ct);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Proxied-From", parsed.hostname);

  return new Response(upstream.body, { status: 200, headers });
}
