// server.js
const express = require("express");
const request = require("request");
const path = require("path");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 4000;

// Simple CORS for the proxied resources & preflight
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range,Origin,Referer,User-Agent,Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range,Content-Length,Accept-Ranges");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Serve the player page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Helper to make absolute URL from a possibly-relative URI
function absoluteUrl(uri, base) {
  try {
    return new URL(uri, base).href;
  } catch (e) {
    return uri;
  }
}

// If the target looks like a playlist (.m3u8) we fetch it as text and rewrite all URIs
app.get("/proxy", (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("Missing url parameter");

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return res.status(400).send("Invalid target URL");
  }
  const hostHeader = parsed.host;

  // Common headers to send upstream (you can adjust if needed)
  const upstreamHeaders = {
    "Origin": req.headers.origin || "https://liveboxpro.com",
    "Referer": req.headers.referer || "https://liveboxpro.com/",
    "User-Agent": req.headers["user-agent"] || "Mozilla/5.0 (Android)",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Host": hostHeader
  };

  // Forward Range if present (important for segments / seeking)
  if (req.headers.range) {
    upstreamHeaders.Range = req.headers.range;
  }

  // If the URL ends with .m3u8 (or contains .m3u8) treat as playlist and rewrite.
  const treatAsPlaylist = /\.m3u8(?:\?|$)/i.test(target);

  if (treatAsPlaylist) {
    // Fetch as buffer (will be decoded if server sends gzip, request handles it)
    request.get({ url: target, headers: upstreamHeaders, encoding: null, timeout: 30000 }, (err, upstreamRes, body) => {
      if (err) {
        console.error("Proxy playlist error:", err && err.message);
        return res.status(502).send("Upstream request failed");
      }

      // Try to decode buffer -> text
      let text;
      try {
        text = body.toString("utf8");
      } catch (e) {
        console.error("Failed to decode playlist body:", e.message);
        return res.status(502).send("Failed to decode playlist");
      }

      // If it doesn't look like an M3U playlist, just pass raw
      if (!/#!?EXTM3U/i.test(text)) {
        // not a playlist (but URL looked like m3u8) -> send as-is
        res.setHeader("Content-Type", upstreamRes.headers["content-type"] || "application/vnd.apple.mpegurl");
        return res.send(text);
      }

      // Rewrite every non-comment line (URIs) and key URIs inside EXT-X-KEY
      const lines = text.split(/\r?\n/);
      const rewritten = lines.map(line => {
        // keep comments & tags except we rewrite URIs inside tags like EXT-X-KEY:URI="..."
        if (line.startsWith("#")) {
          // rewrite URI="..." occurrences (EXT-X-KEY etc)
          return line.replace(/URI="?([^",]+)"?/g, (m, uri) => {
            const abs = absoluteUrl(uri, target);
            return `URI="${"/proxy?url=" + encodeURIComponent(abs)}"`;
          });
        }

        // empty or comment lines remain
        if (!line.trim()) return line;

        // otherwise treat as a media or playlist URI -> make absolute and proxy it
        const abs = absoluteUrl(line.trim(), target);
        return "/proxy?url=" + encodeURIComponent(abs);
      }).join("\n");

      // Send the rewritten playlist
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.send(rewritten);
    });

  } else {
    // Binary (segments, keys, images, etc) -> stream directly while forwarding headers
    const options = {
      url: target,
      headers: upstreamHeaders,
      encoding: null, // stream/buffer binary
      timeout: 30000
    };

    const upstream = request.get(options);

    // catch upstream errors
    upstream.on("error", err => {
      console.error("Proxy stream error:", err && err.message);
      if (!res.headersSent) res.status(502).send("Upstream stream error");
    });

    upstream.on("response", upstreamRes => {
      // Forward key headers
      res.status(upstreamRes.statusCode);
      const ct = upstreamRes.headers["content-type"];
      if (ct) res.setHeader("Content-Type", ct);
      if (upstreamRes.headers["content-length"]) res.setHeader("Content-Length", upstreamRes.headers["content-length"]);
      if (upstreamRes.headers["accept-ranges"]) res.setHeader("Accept-Ranges", upstreamRes.headers["accept-ranges"]);
      if (upstreamRes.headers["content-range"]) res.setHeader("Content-Range", upstreamRes.headers["content-range"]);
      // Note: we keep Access-Control-Allow-Origin via the app.use CORS above
    });

    // Pipe upstream data directly to client
    upstream.pipe(res);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy server listening on port ${PORT}`);
});
