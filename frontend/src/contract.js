import { ethers } from 'ethers';

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export const ABI = [
  'function register(bytes32 encryptedFileHash, string cid)',
  'function verify(bytes32 encryptedFileHash) view returns (bool)',
  'function getMyFiles() view returns (bytes32[])',
  'function getFilesByOwner(address owner) view returns (bytes32[])',
  'function getRecord(bytes32 encryptedFileHash) view returns (string cid, address owner, uint256 timestamp)'
];

export function getRegistryContract(signerOrProvider) {
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS.includes('COLE_O_ENDERECO')) {
    throw new Error('Configure VITE_CONTRACT_ADDRESS no frontend/.env');
  }

  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}
