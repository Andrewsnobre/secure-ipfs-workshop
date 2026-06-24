import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();

const PORT = process.env.PORT || 3333;
const IPFS_UPLOAD_URL =
  process.env.IPFS_UPLOAD_URL || "https://api.ipfs.com.br/upload";

const IPFS_AUTH_KEY = process.env.IPFS_AUTH_KEY || process.env.KEY1;

// Optional token clients must send to use this proxy. If unset, the proxy is
// open (fine for local workshop use, NOT for a public deployment).
const UPLOAD_ACCESS_TOKEN = process.env.UPLOAD_ACCESS_TOKEN;

// Max upload size (default 10 MB) to avoid memory-exhaustion DoS.
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);

// Allowed CORS origins, comma-separated. Defaults to local dev origins.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and whitelisted origins.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
  })
);
app.use(express.json());

// Minimal in-memory rate limiter (per IP): 30 requests / minute.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);
const rateBuckets = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateBuckets.set(ip, bucket);

  if (bucket.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests" });
  }
  next();
}

function requireToken(req, res, next) {
  if (!UPLOAD_ACCESS_TOKEN) return next(); // open mode
  const provided = req.get("x-upload-token");
  if (provided !== UPLOAD_ACCESS_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/upload",
  rateLimit,
  requireToken,
  upload.single("file"),
  async (req, res) => {
  try {
    if (!IPFS_AUTH_KEY) {
      return res.status(500).json({ error: "Missing IPFS_AUTH_KEY or KEY1" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }

    const formData = new FormData();

    const blob = new Blob([req.file.buffer], {
      type: req.file.mimetype || "application/octet-stream",
    });

    formData.append("file", blob, req.file.originalname || "encrypted.dat");

    const ipfsResponse = await fetch(IPFS_UPLOAD_URL, {
      method: "POST",
      headers: {
        "x-api-key": IPFS_AUTH_KEY,
      },
      body: formData,
    });

    const text = await ipfsResponse.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!ipfsResponse.ok) {
      return res.status(ipfsResponse.status).json({
        error: "IPFS upload failed",
        details: data,
      });
    }

    const cid =
      data?.data?.url ||
      data?.cid ||
      data?.CID ||
      data?.Hash ||
      data?.IpfsHash ||
      data?.path ||
      data?.raw;

    if (!cid) {
      return res.status(502).json({
        error: "CID not found in IPFS response",
        ipfsResponse: data,
      });
    }

    return res.json({
      cid,
      fileName: data?.data?.file || req.file.originalname,
      ipfsResponse: data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error.message || "Unexpected backend error",
    });
  }
});

// Centralized error handler (multer limits, CORS rejections, etc.).
app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  if (err?.message === "Origin not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  console.error(err);
  return res.status(500).json({ error: "Unexpected backend error" });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});