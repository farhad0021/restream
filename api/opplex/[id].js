// api/BDIX/[id].js
export default async function handler(req, res) {
  try {
    // Get ID from URL (/api/BDIX/244978.m3u8 or ?id=244978)
    let id = req.query?.id ?? null;
    if (Array.isArray(id)) id = id[0];
    if (!id && typeof req.query === "object") id = req.query.id;
    if (!id) return res.status(400).send("Missing stream id");

    // Strip ".m3u8" if present
    id = String(id).replace(/\.m3u8$/i, "");

    // Xtream Codes base URL (your source)
    const baseXtream =
      "http://opplex.to:8080/live/975567/300900";
    const sourceUrl = `${baseXtream}/${id}.m3u8`;

    // Fetch upstream with browser-like headers
    const upstreamResp = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9," +
          "image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Referer": "http://xott.live/",
        "Origin": "http://xott.live",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1"
      }
    });

    // Handle errors
    if (!upstreamResp.ok) {
      const errText = await upstreamResp.text();
      const errHeaders = Object.fromEntries(upstreamResp.headers.entries());

      console.error(
        "⚠️ Upstream error",
        upstreamResp.status,
        errHeaders,
        errText
      );

      return res.status(upstreamResp.status).send(
        `Upstream returned ${upstreamResp.status}\n\n` +
          `--- HEADERS ---\n${JSON.stringify(errHeaders, null, 2)}\n\n` +
          `--- BODY ---\n${errText}`
      );
    }

    // Final resolved URL
    const finalUrl = upstreamResp.url;
    if (!finalUrl) return res.status(500).send("Failed to resolve redirect.");

    let playlist = await upstreamResp.text();

    // Build base URL (scheme://host[:port])
    const u = new URL(finalUrl);
    const baseUrl = `${u.protocol}//${u.hostname}${
      u.port ? ":" + u.port : ""
    }`;

    const isAbsolute = (s) =>
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("//") ||
      s.startsWith("data:");

    // Replace URIs inside quotes (keys, segments, etc.)
    playlist = playlist.replace(
      /(["'])([^"']+\.(?:ts|m4s|mp4|key|aac|m3u8)(?:\?[^"']*)?)\1/gi,
      (match, quote, url) => {
        if (isAbsolute(url)) {
          if (url.startsWith("//")) return `${quote}${u.protocol}${url}${quote}`;
          return `${quote}${url}${quote}`;
        }
        return `${quote}${baseUrl}${url.startsWith("/") ? "" : "/"}${url}${quote}`;
      }
    );

    // Fix plain segment lines
    const lines = playlist.split(/\r?\n/).map((ln) => {
      const t = ln.trim();
      if (!t || t.startsWith("#")) return ln;
      if (isAbsolute(t)) {
        if (t.startsWith("//")) return u.protocol + t;
        return ln;
      }
      return `${baseUrl}${t.startsWith("/") ? "" : "/"}${t}`;
    });

    const finalPlaylist = lines.join("\n");

    // Send result
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.status(200).send(finalPlaylist);
  } catch (err) {
    console.error("⚠️ Server error", err);
    return res.status(500).send("Server error: " + (err.message || err));
  }
}
