import express from "express";
import request from "request";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Proxy endpoint
app.get("/proxy", (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 13; M2012K11AI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.125 Mobile Safari/537.36",
    Origin: "https://liveboxpro.com",
    Referer: "https://liveboxpro.com/",
    Connection: "Keep-Alive",
  };

  request
    .get({ url: targetUrl, headers })
    .on("error", (err) => {
      console.error("Proxy error:", err);
      res.status(500).send("Proxy request failed");
    })
    .pipe(res);
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
