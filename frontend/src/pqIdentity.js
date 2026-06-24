// Post-quantum identity management.
//
// The root of trust for file confidentiality is an independent BIP-39 mnemonic
// generated *inside the app* — NOT the MetaMask wallet. From it we derive a
// persistent ML-KEM-768 key pair. The mnemonic never depends on (and cannot be
// reconstructed from) the wallet's secp256k1 key, so a quantum attacker that
// breaks the on-chain ECDSA still cannot recover it.
//
// At rest, the mnemonic is encrypted with AES-256-GCM whose key is derived from
// a user passphrase via Argon2id (a memory-hard, quantum-resistant KDF — no
// public-key cryptography involved). The encrypted blob lives in localStorage.

import { MlKem768 } from "mlkem";
import { Wallet, JsonRpcProvider, parseEther } from "ethers";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { argon2id } from "@noble/hashes/argon2";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import {
  bytesToHex,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from "@noble/hashes/utils";

const STORAGE_KEY = "secure-ipfs-pq-identity-v1";

// Argon2id parameters. Tuned to be tolerable in pure-JS in the browser while
// still memory-hard. Bump `m`/`t` for stronger protection at the cost of speed.
const ARGON_OPTS = { t: 3, m: 32 * 1024, p: 1, dkLen: 32 }; // 32 MiB

// RPC endpoint for the in-app Ethereum wallet (no MetaMask needed).
const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";

// Well-known funded account #0 of a Hardhat node started with its default
// mnemonic ("test test ... junk"). Used ONLY to top up the in-app wallet with
// gas on a LOCAL dev chain. Never use this on a public network.
const HARDHAT_FUNDER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

// Deterministically derive the ML-KEM-768 key pair from the mnemonic.
async function deriveKeypairFromMnemonic(mnemonic) {
  const bip39Seed = mnemonicToSeedSync(mnemonic); // 64 bytes (PBKDF2-HMAC-SHA512)
  // Domain-separate so this seed is only ever used for this purpose.
  const kemSeed = hkdf(
    sha256,
    bip39Seed,
    undefined,
    utf8ToBytes("secure-ipfs-mlkem768-seed-v1"),
    64
  );
  const kem = new MlKem768();
  const [publicKey, privateKey] = await kem.deriveKeyPair(kemSeed);
  return { publicKey, privateKey };
}

// Build the full in-memory identity from a mnemonic: the post-quantum ML-KEM
// key pair AND an Ethereum wallet (standard BIP-44 path) connected to the RPC,
// so the same mnemonic both encrypts files and signs on-chain transactions.
async function buildIdentity(mnemonic) {
  const { publicKey, privateKey } = await deriveKeypairFromMnemonic(mnemonic);
  const provider = new JsonRpcProvider(RPC_URL);
  const ethWallet = Wallet.fromPhrase(mnemonic, provider);
  return { publicKey, privateKey, ethWallet, ethAddress: ethWallet.address };
}

// ---------------------------------------------------------------------------
// At-rest encryption (Argon2id + AES-256-GCM)
// ---------------------------------------------------------------------------

async function aesKeyFromPassphrase(passphrase, salt) {
  const dk = argon2id(utf8ToBytes(passphrase), salt, ARGON_OPTS);
  return crypto.subtle.importKey("raw", dk, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptMnemonicAtRest(mnemonic, passphrase) {
  const salt = randomBytes(16);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKeyFromPassphrase(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    utf8ToBytes(mnemonic)
  );
  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

async function decryptMnemonicAtRest(record, passphrase) {
  const key = await aesKeyFromPassphrase(passphrase, hexToBytes(record.salt));
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBytes(record.iv) },
      key,
      hexToBytes(record.ciphertext)
    );
  } catch {
    throw new Error("Passphrase incorreta.");
  }
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function readRecord() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function writeRecord(record) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function hasIdentity() {
  return readRecord() !== null;
}

// Public key is stored in clear so files can be encrypted without unlocking.
export function getStoredPublicKey() {
  const record = readRecord();
  return record ? hexToBytes(record.publicKey) : null;
}

export function deleteIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function persistIdentity(mnemonic, passphrase) {
  const identity = await buildIdentity(mnemonic);
  const wrapped = await encryptMnemonicAtRest(mnemonic, passphrase);
  writeRecord({
    version: 1,
    publicKey: bytesToHex(identity.publicKey),
    ...wrapped,
  });
  return { mnemonic, ...identity };
}

// Create a brand-new identity. Returns the mnemonic so the UI can show it for
// backup. The caller MUST make the user record it.
export async function createIdentity(passphrase) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Passphrase deve ter ao menos 8 caracteres.");
  }
  const mnemonic = generateMnemonic(wordlist, 256); // 24 words
  return persistIdentity(mnemonic, passphrase);
}

// Restore an identity from a backed-up mnemonic (e.g. on a new device).
export async function importIdentity(mnemonic, passphrase) {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Mnemônico inválido.");
  }
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Passphrase deve ter ao menos 8 caracteres.");
  }
  return persistIdentity(normalized, passphrase);
}

// Unlock the stored identity with the passphrase. Returns the in-memory
// identity (including the private key) — keep it only in memory, never persist.
export async function unlockIdentity(passphrase) {
  const record = readRecord();
  if (!record) throw new Error("Nenhuma identidade PQ encontrada.");
  const mnemonic = await decryptMnemonicAtRest(record, passphrase);
  return buildIdentity(mnemonic);
}

// Read-only provider for the configured RPC (used for balance/verify when no
// identity is unlocked).
export function getProvider() {
  return new JsonRpcProvider(RPC_URL);
}

// Local dev helper: fund the in-app wallet with gas from the Hardhat node's
// default account #0. Only works on a local Hardhat chain.
export async function fundFromHardhat(toAddress, amountEth = "1") {
  const provider = new JsonRpcProvider(RPC_URL);
  const funder = new Wallet(HARDHAT_FUNDER_PK, provider);
  const tx = await funder.sendTransaction({
    to: toAddress,
    value: parseEther(amountEth),
  });
  await tx.wait();
}
