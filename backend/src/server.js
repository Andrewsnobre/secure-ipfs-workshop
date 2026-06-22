import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3333;
const IPFS_UPLOAD_URL =
  process.env.IPFS_UPLOAD_URL || "https://api.ipfs.com.br/upload";

const IPFS_AUTH_KEY = process.env.IPFS_AUTH_KEY || process.env.KEY1;

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/upload", upload.single("file"), async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});