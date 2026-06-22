import { ethers } from "ethers";

const encoder = new TextEncoder();

async function deriveAesKeyFromWallet(signer) {
    const address = await signer.getAddress();

    const message =
        `Secure IPFS Registry\nWallet: ${address}\nPurpose: file-encryption-v1`;

    const signature = await signer.signMessage(message);
    const signatureBytes = ethers.getBytes(signature);

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        signatureBytes,
        "HKDF",
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: encoder.encode(address.toLowerCase()),
            info: encoder.encode("secure-ipfs-aes-256-gcm"),
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encryptFileWithWallet(file, signer) {
    const aesKey = await deriveAesKeyFromWallet(signer);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        fileBytes
    );

    return JSON.stringify({
        version: "wallet-aes-gcm-v1",
        algorithm: "Wallet Signature + HKDF + AES-256-GCM",
        iv: Array.from(iv),
        encryptedFile: Array.from(new Uint8Array(encryptedBuffer)),
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
    });
}

export async function decryptFileWithWallet(encryptedPayload, signer) {
    const aesKey = await deriveAesKeyFromWallet(signer);
    const payload = JSON.parse(encryptedPayload);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
        aesKey,
        new Uint8Array(payload.encryptedFile)
    );

    return {
        bytes: new Uint8Array(decryptedBuffer),
        fileName: payload.originalName || "arquivo-recuperado",
        mimeType: payload.mimeType || "application/octet-stream",
    };
}