import { ethers } from 'ethers';

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask não encontrada');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

export async function signHash(signer, fileHash) {
  return signer.signMessage(`Secure IPFS Registry hash: ${fileHash}`);
}
