import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';

export async function encryptFile(file, password) {
  const buffer = await file.arrayBuffer();
  const wordArray = CryptoJS.lib.WordArray.create(buffer);
  return CryptoJS.AES.encrypt(wordArray, password).toString();
}

export function decryptFile(encryptedContent, password) {
  const decrypted = CryptoJS.AES.decrypt(encryptedContent, password);
  const words = decrypted.toString(CryptoJS.enc.Latin1);

  if (!words) {
    throw new Error("Senha incorreta ou conteúdo inválido.");
  }

  const bytes = new Uint8Array(words.length);

  for (let i = 0; i < words.length; i++) {
    bytes[i] = words.charCodeAt(i);
  }

  return bytes;
}

export function hashEncryptedContent(encryptedContent) {
  return ethers.keccak256(ethers.toUtf8Bytes(encryptedContent));


}
