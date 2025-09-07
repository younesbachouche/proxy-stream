const express = require("express");
const request = require("request");
const path = require("path");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 4000;

// Serve player
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Dynamic proxy
app.get("/proxy", (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  let hostHeader = "";
  try {
    const parsed = new URL(targetUrl);
    hostHeader = parsed.host; // extract hostname automatically
  } catch (e) {
    return res.status(400).send("Invalid URL");
  }

  const options = {
    url: targetUrl,
    headers: {
      "Origin": req.headers.origin || "https://liveboxpro.com",
      "Referer": req.headers.referer || "https://liveboxpro.com/",
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; M2012K11AI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.125 Mobile Safari/537.36",
      "Accept-Encoding": "gzip",
      "Connection": "keep-alive",
      "Host": hostHeader,
    },
    encoding: null, // binary-safe
  };

  request(options)
    .on("error", (err) => {
      console.error("Proxy error:", err.message);
      res.status(500).send("Proxy error");
    })
    .pipe(res);
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
