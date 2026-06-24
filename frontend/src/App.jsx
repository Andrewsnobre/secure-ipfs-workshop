import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { hashEncryptedContent } from "./crypto";
import { encryptFileToIdentity, decryptFileWithIdentity } from "./pqCrypto";
import {
  hasIdentity,
  createIdentity,
  importIdentity,
  unlockIdentity,
  getStoredPublicKey,
  deleteIdentity,
  fundFromHardhat,
  getProvider,
} from "./pqIdentity";
import { uploadEncryptedToIPFS } from "./ipfs";
import { signHash } from "./wallet";
import { getRegistryContract } from "./contract";

export default function App() {
  const [file, setFile] = useState(null);
  const [myFiles, setMyFiles] = useState([]);
  const [address, setAddress] = useState("");
  const [cid, setCid] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [status, setStatus] = useState("Pronto para iniciar.");
  const [verifyHash, setVerifyHash] = useState("");
  const [record, setRecord] = useState(null);

  // Post-quantum identity state.
  const [pqExists, setPqExists] = useState(false);
  const [identity, setIdentity] = useState(null); // unlocked (in-memory) identity
  const [passphrase, setPassphrase] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [mnemonicBackup, setMnemonicBackup] = useState("");
  const [balanceWei, setBalanceWei] = useState(null);

  const hasFunds = balanceWei !== null && balanceWei > 0n;

  useEffect(() => {
    setPqExists(hasIdentity());
  }, []);

  // The on-chain signer always comes from the PQ identity's in-app wallet.
  function requireSigner() {
    if (!identity?.ethWallet) {
      throw new Error("Desbloqueie sua identidade PQ primeiro.");
    }
    return { signer: identity.ethWallet, address: identity.ethAddress };
  }

  function getReadProvider() {
    return identity?.ethWallet?.provider || getProvider();
  }

  async function refreshBalance(addr, provider) {
    try {
      const wei = await (provider || getProvider()).getBalance(addr);
      setBalanceWei(wei);
      return wei;
    } catch {
      setBalanceWei(null);
      return null;
    }
  }

  async function handleFundWallet() {
    try {
      if (!identity?.ethAddress) {
        throw new Error("Desbloqueie a identidade PQ primeiro.");
      }
      setStatus("Financiando a wallet interna (dev/Hardhat)...");
      await fundFromHardhat(identity.ethAddress);
      await refreshBalance(identity.ethAddress, identity.ethWallet.provider);
      setStatus("Wallet interna financiada com 1 ETH (rede local).");
    } catch (error) {
      setStatus(`Erro ao financiar: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Post-quantum identity
  // -------------------------------------------------------------------------

  async function handleCreateIdentity() {
    try {
      setStatus("Gerando identidade pós-quântica...");
      const id = await createIdentity(passphrase);
      setMnemonicBackup(id.mnemonic);
      setIdentity(id); // already unlocked (ML-KEM + wallet interna prontos)
      setAddress(id.ethAddress);
      setPqExists(true);
      setPassphrase("");
      await refreshBalance(id.ethAddress, id.ethWallet.provider);
      setStatus("Identidade PQ criada e desbloqueada. ANOTE o mnemônico abaixo.");
    } catch (error) {
      setStatus(`Erro: ${error.message}`);
    }
  }

  async function handleUnlockIdentity() {
    try {
      setStatus("Desbloqueando identidade PQ...");
      const id = await unlockIdentity(passphrase);
      setIdentity(id);
      setAddress(id.ethAddress);
      setPassphrase("");
      await refreshBalance(id.ethAddress, id.ethWallet.provider);
      setStatus("Identidade PQ desbloqueada.");
    } catch (error) {
      setStatus(`Erro: ${error.message}`);
    }
  }

  async function handleImportIdentity() {
    try {
      setStatus("Importando identidade a partir do mnemônico...");
      const id = await importIdentity(importPhrase, passphrase);
      setIdentity(id);
      setAddress(id.ethAddress);
      setImportPhrase("");
      setPassphrase("");
      setPqExists(true);
      await refreshBalance(id.ethAddress, id.ethWallet.provider);
      setStatus("Identidade PQ importada e desbloqueada.");
    } catch (error) {
      setStatus(`Erro: ${error.message}`);
    }
  }

  function handleResetIdentity() {
    if (
      !window.confirm(
        "Apagar a identidade PQ deste dispositivo? Sem o mnemônico você perde acesso aos arquivos. Continuar?"
      )
    )
      return;
    deleteIdentity();
    setIdentity(null);
    setAddress("");
    setBalanceWei(null);
    setPqExists(false);
    setMnemonicBackup("");
    setStatus("Identidade PQ removida deste dispositivo.");
  }

  // -------------------------------------------------------------------------
  // Recover
  // -------------------------------------------------------------------------

  async function recoverFile(cid) {
    try {
      if (!identity) {
        throw new Error("Desbloqueie sua identidade PQ antes de recuperar.");
      }

      setStatus("Baixando conteúdo criptografado do IPFS...");
      const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
      if (!response.ok) throw new Error("Falha ao baixar arquivo do IPFS.");

      const encryptedContent = await response.text();

      setStatus("Descriptografando localmente com a identidade PQ...");
      const recovered = await decryptFileWithIdentity(encryptedContent, identity);

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

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  async function handleSecureUpload() {
    try {
      if (!file) throw new Error("Selecione um arquivo.");

      const publicKey = getStoredPublicKey();
      if (!publicKey) {
        throw new Error("Crie uma identidade PQ antes de enviar arquivos.");
      }
      if (!hasFunds) {
        throw new Error("Wallet sem saldo: financie a wallet antes de registrar.");
      }

      setRecord(null);

      setStatus("1/6 Preparando assinante on-chain...");
      const { signer, address } = requireSigner();
      setAddress(address);

      setStatus("2/6 Criptografando com ML-KEM-768 + AES-256-GCM (identidade PQ)...");
      const encrypted = await encryptFileToIdentity(file, publicKey);

      setStatus("3/6 Calculando hash do conteúdo criptografado...");
      const hash = hashEncryptedContent(encrypted);
      setFileHash(hash);
      setVerifyHash(hash);

      setStatus("4/6 Enviando arquivo criptografado para IPFS...");
      const uploadedCid = await uploadEncryptedToIPFS(encrypted);
      setCid(uploadedCid);

      setStatus("5/6 Assinando hash com a wallet...");
      await signHash(signer, hash);

      setStatus("6/6 Registrando CID + hash no smart contract...");
      const contract = getRegistryContract(signer);
      const tx = await contract.register(hash, uploadedCid);
      await tx.wait();

      await refreshBalance(address, signer.provider);
      setStatus(
        "Concluído: arquivo criptografado, publicado no IPFS e registrado on-chain."
      );
    } catch (error) {
      setStatus(`Erro: ${error.message}`);
    }
  }

  async function loadMyFiles() {
    try {
      setStatus("Carregando meus arquivos...");
      const { signer } = requireSigner();
      const contract = getRegistryContract(signer);
      const hashes = await contract.getMyFiles();

      const files = [];
      for (const hash of hashes) {
        const result = await contract.getRecord(hash);
        files.push({
          hash,
          cid: result[0],
          owner: result[1],
          timestamp: new Date(Number(result[2]) * 1000).toLocaleString(),
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
      setStatus("Verificando registro on-chain...");

      const provider = getReadProvider();
      const contract = getRegistryContract(provider);
      const exists = await contract.verify(verifyHash);

      if (!exists) {
        setStatus("Registro não encontrado.");
        return;
      }

      const result = await contract.getRecord(verifyHash);
      setRecord({
        cid: result[0],
        owner: result[1],
        timestamp: new Date(Number(result[2]) * 1000).toLocaleString(),
      });

      setStatus("Registro encontrado e verificado.");
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
            Criptografia pós-quântica client-side com identidade própria (ML-KEM-768),
            upload para IPFS e registro on-chain — wallet derivada do seu mnemônico.
          </p>
        </div>
      </section>

      <section className="card">
        <h2>
          0. Identidade Pós-Quântica{" "}
          <span className={`pill ${identity ? "ok" : pqExists ? "warn" : "muted"}`}>
            {identity ? "Desbloqueada" : pqExists ? "Bloqueada" : "Inexistente"}
          </span>
        </h2>
        <p className="status">
          {identity
            ? "Identidade desbloqueada (em memória)."
            : pqExists
            ? "Identidade existe neste dispositivo — desbloqueie para recuperar arquivos."
            : "Nenhuma identidade. Crie uma para começar."}
        </p>

        <label>Passphrase</label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="mínimo 8 caracteres"
        />

        <div className="btn-row">
          {!pqExists && (
            <button onClick={handleCreateIdentity}>Criar identidade PQ</button>
          )}
          {pqExists && !identity && (
            <button onClick={handleUnlockIdentity}>Desbloquear</button>
          )}
          {identity && (
            <button className="secondary" onClick={handleFundWallet}>
              Financiar wallet (dev)
            </button>
          )}
          {pqExists && (
            <button className="ghost" onClick={handleResetIdentity}>
              Apagar deste dispositivo
            </button>
          )}
        </div>

        {identity?.ethAddress && (
          <>
            <p className="kv">
              <b>Wallet interna</b>
              <span className="mono">{identity.ethAddress}</span>
            </p>
            <div className="btn-row" style={{ marginTop: 6 }}>
              <span className={`pill ${hasFunds ? "ok" : "warn"}`}>
                Saldo:{" "}
                {balanceWei === null
                  ? "—"
                  : `${ethers.formatEther(balanceWei)} ETH`}
              </span>
              <button
                className="secondary"
                onClick={() =>
                  refreshBalance(identity.ethAddress, identity.ethWallet.provider)
                }
              >
                Atualizar
              </button>
            </div>
            {!hasFunds && (
              <p className="warn-text">
                Sem saldo para gás — financie a wallet para poder registrar
                on-chain.
              </p>
            )}
          </>
        )}

        {mnemonicBackup && (
          <div className="card success" style={{ marginTop: 16 }}>
            <h3>⚠️ Anote estas 24 palavras (backup único)</h3>
            <p className="mono" style={{ wordSpacing: 4, lineHeight: 1.9, display: "block" }}>
              {mnemonicBackup}
            </p>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              Quem tiver estas palavras pode descriptografar seus arquivos. Sem
              elas, a perda é irreversível.
            </p>
            <button className="secondary" onClick={() => setMnemonicBackup("")}>
              Guardei minhas palavras
            </button>
          </div>
        )}

        <details>
          <summary>Restaurar de um mnemônico</summary>
          <label>Mnemônico (24 palavras)</label>
          <textarea
            rows={3}
            value={importPhrase}
            onChange={(e) => setImportPhrase(e.target.value)}
            placeholder="palavra1 palavra2 ..."
          />
          <button onClick={handleImportIdentity}>Importar identidade</button>
        </details>
      </section>

      <section className="grid">
        <div className="card">
          <h2>1. Upload seguro</h2>
          <label>Arquivo</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button
            onClick={handleSecureUpload}
            disabled={!identity || !hasFunds}
            title={
              !identity
                ? "Desbloqueie a identidade PQ"
                : !hasFunds
                ? "Wallet sem saldo para gás"
                : ""
            }
          >
            Criptografar (PQ) + IPFS + Blockchain
          </button>
          {identity && !hasFunds && (
            <p className="warn-text">Wallet sem saldo: financie para habilitar.</p>
          )}
        </div>

        <div className="card">
          <h2>2. Verificação</h2>
          <label>Hash do arquivo criptografado</label>
          <input
            value={verifyHash}
            onChange={(e) => setVerifyHash(e.target.value)}
          />
          <button onClick={handleVerify}>Verificar on-chain</button>
        </div>
      </section>

      <section className="card">
        <h2>Status</h2>
        <p className="status">{status}</p>
        {address && <p className="kv"><b>Wallet</b><span className="mono">{address}</span></p>}
        {cid && <p className="kv"><b>CID</b><span className="mono">{cid}</span></p>}
        {fileHash && <p className="kv"><b>Hash</b><span className="mono">{fileHash}</span></p>}
      </section>

      <section className="card">
        <h2>Meus Arquivos</h2>
        <button className="secondary" onClick={loadMyFiles}>
          Carregar meus arquivos
        </button>

        {myFiles.map((item) => (
          <div key={item.hash} className="record-item">
            <p className="kv"><b>Hash</b><span className="mono">{item.hash}</span></p>
            <p className="kv"><b>CID</b><span className="mono">{item.cid}</span></p>
            <p className="kv"><b>Owner</b><span className="mono">{item.owner}</span></p>
            <p className="kv"><b>Data</b>{item.timestamp}</p>
            <div className="btn-row">
              <a
                href={`https://ipfs.io/ipfs/${item.cid}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no IPFS
              </a>
              <button onClick={() => recoverFile(item.cid)}>
                Recuperar arquivo (identidade PQ)
              </button>
            </div>
          </div>
        ))}
      </section>

      {record && (
        <section className="card success">
          <h2>Registro on-chain</h2>
          <p className="kv"><b>CID</b><span className="mono">{record.cid}</span></p>
          <p className="kv"><b>Owner</b><span className="mono">{record.owner}</span></p>
          <p className="kv"><b>Timestamp</b>{record.timestamp}</p>
        </section>
      )}
    </main>
  );
}
