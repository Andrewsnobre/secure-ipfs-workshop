import { ethers } from "ethers";
import { MlKem768 } from "mlkem";

const encoder = new TextEncoder();

async function deriveWalletWrappingKey(signer) {
    const address = await signer.getAddress();
    const network = await signer.provider.getNetwork();

    // The wrapping key MUST come from a secret only this wallet can produce.
    // personal_sign uses deterministic ECDSA (RFC 6979), so signing the same
    // message with the same key always yields the same signature: we use that
    // signature as the key material. The address/chainId are bound into the
    // message (and the HKDF salt) for domain separation, but they are NOT the
    // secret — the secret is the signature itself.
    const signature = await signer.signMessage(
        `Secure IPFS Registry\nWallet: ${address}\nChain: ${network.chainId.toString()}\nPurpose: authorize-pqc-file-encryption-v3`
    );

    const signatureBytes = ethers.getBytes(signature);

    // Import the signature as HKDF input keying material, then derive a
    // dedicated AES-256-GCM key from it.
    const ikm = await crypto.subtle.importKey(
        "raw",
        signatureBytes,
        "HKDF",
        false,
        ["deriveKey"]
    );

    const salt = ethers.toUtf8Bytes(
        `secure-ipfs-wallet-wrap-v3:${network.chainId.toString()}:${address.toLowerCase()}`
    );

    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt,
            info: encoder.encode("wallet-wrapped-mlkem-private-key"),
        },
        ikm,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function aesKeyFromSharedSecret(sharedSecret) {
    return await crypto.subtle.importKey(
        "raw",
        sharedSecret.slice(0, 32),
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptBytesWithWallet(bytes, signer) {
    const wrappingKey = await deriveWalletWrappingKey(signer);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        wrappingKey,
        bytes
    );

    return {
        iv: Array.from(iv),
        encrypted: Array.from(new Uint8Array(encrypted)),
    };
}

async function decryptBytesWithWallet(payload, signer) {
    const wrappingKey = await deriveWalletWrappingKey(signer);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
        wrappingKey,
        new Uint8Array(payload.encrypted)
    );

    return new Uint8Array(decrypted);
}

export async function encryptFilePQCWithWallet(file, signer) {
    const kem = new MlKem768();

    const [publicKey, privateKey] = await kem.generateKeyPair();
    const [kemCiphertext, sharedSecret] = await kem.encap(publicKey);

    const fileAesKey = await aesKeyFromSharedSecret(sharedSecret);

    const fileIv = crypto.getRandomValues(new Uint8Array(12));
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const encryptedFile = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: fileIv },
        fileAesKey,
        fileBytes
    );

    const wrappedPrivateKey = await encryptBytesWithWallet(privateKey, signer);

    return JSON.stringify({
        version: "wallet-mlkem768-aes256gcm-v3",
        algorithm: "ML-KEM-768 + AES-256-GCM + signature-derived wallet-wrapped private key",
        publicKey: Array.from(publicKey),
        wrappedPrivateKey,
        kemCiphertext: Array.from(kemCiphertext),
        fileIv: Array.from(fileIv),
        encryptedFile: Array.from(new Uint8Array(encryptedFile)),
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
    });
}

export async function decryptFilePQCWithWallet(encryptedPayload, signer) {
    const payload = JSON.parse(encryptedPayload);

    const kem = new MlKem768();

    const privateKey = await decryptBytesWithWallet(
        payload.wrappedPrivateKey,
        signer
    );

    const sharedSecret = await kem.decap(
        new Uint8Array(payload.kemCiphertext),
        privateKey
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