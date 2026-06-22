import React, { useState } from "react";
import { ethers } from 'ethers';
import { hashEncryptedContent } from "./crypto";
import {
  encryptFilePQCWithWallet,
  decryptFilePQCWithWallet,
} from "./pqWalletCrypto";
import { uploadEncryptedToIPFS } from './ipfs';
import { connectWallet, signHash } from './wallet';
import { getRegistryContract } from './contract';

export default function App() {
  const [file, setFile] = useState(null);
  const [myFiles, setMyFiles] = useState([]);
  //const [password, setPassword] = useState('demo-password');
  const [address, setAddress] = useState('');
  const [cid, setCid] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [status, setStatus] = useState('Pronto para iniciar.');
  const [verifyHash, setVerifyHash] = useState('');
  const [record, setRecord] = useState(null);

  async function handleConnect() {
    const wallet = await connectWallet();
    setAddress(wallet.address);
    setStatus('Wallet conectada.');
  }

async function recoverFile(cid) {
  try {
    console.log("RECOVER START", cid);
    setStatus("Conectando wallet para recuperar a chave...");

    const { signer } = await connectWallet();

    setStatus("Baixando conteúdo criptografado do IPFS...");
    const response = await fetch(`https://ipfs.io/ipfs/${cid}`);

    console.log("IPFS response", response.status);

    if (!response.ok) {
      throw new Error("Falha ao baixar arquivo do IPFS.");
    }

    const encryptedContent = await response.text();
    console.log("Encrypted length:", encryptedContent.length);
    console.log("Encrypted preview:", encryptedContent.slice(0, 80));

    setStatus("Descriptografando arquivo localmente com a wallet...");
    const recovered = await decryptFilePQCWithWallet(encryptedContent, signer);

    console.log("Recovered:", recovered);
    console.log("Bytes:", recovered.bytes?.length);

    if (!recovered.bytes || recovered.bytes.length === 0) {
      throw new Error("Arquivo descriptografado vazio.");
    }

    const blob = new Blob([recovered.bytes], {
      type: recovered.mimeType || "application/octet-stream",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = recovered.fileName || "arquivo-recuperado";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

    setStatus("Arquivo recuperado com sucesso.");
  } catch (error) {
    console.error("RECOVER ERROR:", error);
    setStatus(`Erro: ${error.message}`);
  }
}

  async function handleSecureUpload() {
    try {
      if (!file) throw new Error('Selecione um arquivo.');
    
setRecord(null);

setStatus("1/6 Conectando wallet...");
const { signer, address } = await connectWallet();
setAddress(address);

setStatus("2/6 Criptografando com ML-KEM-768 + AES-256-GCM...");
const encrypted = await encryptFilePQCWithWallet(file, signer);



      setStatus('3/6 Calculando hash do conteúdo criptografado...');
      const hash = hashEncryptedContent(encrypted);
      setFileHash(hash);
      setVerifyHash(hash);

      setStatus('4/6 Enviando arquivo criptografado para IPFS...');
      const uploadedCid = await uploadEncryptedToIPFS(encrypted);
      setCid(uploadedCid);

setStatus("5/6 Assinando hash com a wallet...");
const signature = await signHash(signer, hash);

      setStatus('6/6 Registrando CID + hash no smart contract...');
      const contract = getRegistryContract(signer);
      const tx = await contract.register(hash, uploadedCid);
      await tx.wait();

      setStatus('Concluído: arquivo criptografado, publicado no IPFS e registrado on-chain.');
    } catch (error) {
      setStatus(`Erro: ${error.message}`);
    }
  }

  async function loadMyFiles() {
  try {
    setStatus("Carregando meus arquivos...");

    const { signer } = await connectWallet();
    const contract = getRegistryContract(signer);

    const hashes = await contract.getMyFiles();

    const files = [];

    for (const hash of hashes) {
      const result = await contract.getRecord(hash);

      files.push({
        hash,
        cid: result[0],
        owner: result[1],
    
        timestamp: new Date(Number(result[2]) * 1000).toLocaleString()
      });
    }

    setMyFiles(files);
    setStatus(`${files.length} arquivo(s) encontrado(s).`);
  } catch (error) {
    setStatus(`Erro: ${error.message}`);
  }
}

  async function handleVerify() {
    try {
      setRecord(null);
      setStatus('Verificando registro on-chain...');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = getRegistryContract(provider);
      const exists = await contract.verify(verifyHash);

      if (!exists) {
        setStatus('Registro não encontrado.');
        return;
      }

      const result = await contract.getRecord(verifyHash);
      setRecord({
        cid: result[0],
        owner: result[1],
    
        timestamp: new Date(Number(result[2]) * 1000).toLocaleString()
      });

      setStatus('Registro encontrado e verificado.');
    } catch (error) {
      setStatus(`Erro: ${error.message}`);
    }
  }

  return (
    <main className="page">
      <section className="card hero">
        <div>
          <p className="eyebrow">Workshop Blockchain + IPFS</p>
          <h1>Secure IPFS Registry</h1>
          <p className="subtitle">
            Demonstração prática: criptografia client-side, upload para IPFS, assinatura com wallet e registro em smart contract.
          </p>
        </div>
        <button onClick={handleConnect}>Conectar Wallet</button>
      </section>

      <section className="grid">
        <div className="card">
          <h2>1. Upload seguro</h2>
          <label>Arquivo</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />

   
          <button onClick={handleSecureUpload}>
 Criptografar com Wallet + ML-KEM-768 + IPFS + Blockchain
</button>
        </div>

        <div className="card">
          <h2>2. Verificação</h2>
          <label>Hash do arquivo criptografado</label>
          <input value={verifyHash} onChange={(e) => setVerifyHash(e.target.value)} />
          <button onClick={handleVerify}>Verificar on-chain</button>
        </div>
      </section>

      


<section className="card">
  <h2>Status</h2>
  <p className="status">{status}</p>

  {address && <p><b>Wallet:</b> {address}</p>}
  {cid && <p><b>CID:</b> {cid}</p>}
  {fileHash && <p><b>Hash:</b> {fileHash}</p>}
</section>

<section className="card">
  <h2>Meus Arquivos</h2>

  <button onClick={loadMyFiles}>Carregar meus arquivos</button>

  {myFiles.map((item) => (
    <div key={item.hash} className="record-item">
      <p><b>Hash:</b> {item.hash}</p>
      <p><b>CID:</b> {item.cid}</p>
      <p><b>Owner:</b> {item.owner}</p>
      <p><b>Data:</b> {item.timestamp}</p>
      <a
        href={`https://ipfs.io/ipfs/${item.cid}`}
        target="_blank"
        rel="noreferrer"
      >
        Abrir no IPFS
      </a>

      <br />

<button onClick={() => recoverFile(item.cid)}>
  Recuperar arquivo com wallet
</button>
    </div>
  ))}
</section>

      {record && (
        <section className="card success">
          <h2>Registro on-chain</h2>
          <p><b>CID:</b> {record.cid}</p>
          <p><b>Owner:</b> {record.owner}</p>
          <p><b>Timestamp:</b> {record.timestamp}</p>
        </section>




      )}
    </main>
  );
}
