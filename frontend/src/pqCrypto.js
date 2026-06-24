// File encryption using the persistent post-quantum identity.
//
// Encryption only needs the identity's PUBLIC key, so it works without the
// passphrase. Decryption needs the PRIVATE key, available only after unlocking
// the identity. Crucially, the private key is NEVER stored in the IPFS payload
// — only the KEM ciphertext is, so confidentiality depends solely on the PQ
// identity, not on the wallet.

import { MlKem768 } from "mlkem";

async function aesKeyFromSharedSecret(sharedSecret) {
  return crypto.subtle.importKey(
    "raw",
    sharedSecret.slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt a file to the identity's ML-KEM public key.
export async function encryptFileToIdentity(file, publicKey) {
  const kem = new MlKem768();

  // Fresh shared secret per file (encap uses internal randomness).
  const [kemCiphertext, sharedSecret] = await kem.encap(publicKey);
  const fileAesKey = await aesKeyFromSharedSecret(sharedSecret);

  const fileIv = crypto.getRandomValues(new Uint8Array(12));
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const encryptedFile = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: fileIv },
    fileAesKey,
    fileBytes
  );

  return JSON.stringify({
    version: "pq-identity-mlkem768-aes256gcm-v1",
    algorithm: "ML-KEM-768 + AES-256-GCM (encrypted to persistent PQ identity)",
    kemCiphertext: Array.from(kemCiphertext),
    fileIv: Array.from(fileIv),
    encryptedFile: Array.from(new Uint8Array(encryptedFile)),
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
  });
}

// Decrypt a payload using the unlocked identity (must hold the private key).
export async function decryptFileWithIdentity(encryptedPayload, identity) {
  const payload = JSON.parse(encryptedPayload);
  const kem = new MlKem768();

  const sharedSecret = await kem.decap(
    new Uint8Array(payload.kemCiphertext),
    identity.privateKey
  );
  const fileAesKey = await aesKeyFromSharedSecret(sharedSecret);

  const decryptedFile = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.fileIv) },
    fileAesKey,
    new Uint8Array(payload.encryptedFile)
  );

  return {
    bytes: new Uint8Array(decryptedFile),
    fileName: payload.originalName || "arquivo-recuperado",
    mimeType: payload.mimeType || "application/octet-stream",
  };
}
