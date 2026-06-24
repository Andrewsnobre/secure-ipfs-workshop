# Secure IPFS Workshop

Demo desenvolvido para o workshop:

**Construindo Aplicações Seguras com Blockchain e IPFS**

## Arquitetura

```text
                 Mnemônico BIP-39 (24 palavras)
                  │                       │
   ML-KEM-768 ◄───┘                       └───► Wallet Ethereum (secp256k1)
        │                                              │
        ▼                                              │
Arquivo → AES-256-GCM (chave via ML-KEM)               │
        ▼                                              │
       IPFS → CID                                      │
        ▼                                              ▼
Hash do conteúdo cifrado ──────────────────► Smart Contract (dono + CID)
```

Todo o processo de criptografia ocorre no navegador.

**Um único mnemônico**, dois usos derivados dele:

- **Camada Pós-Quântica** (ML-KEM-768) → confidencialidade dos arquivos.
- **Wallet Ethereum** → identidade/propriedade on-chain (derivada do mnemônico).

O backend atua apenas como proxy para proteger a chave de acesso ao serviço IPFS.

---

## Fluxo Completo

### 1. Identidade única

O app gera **um único mnemônico** que serve de raiz para tudo:

```text
Mnemônico BIP-39 (24 palavras)
   ├── caminho BIP-44 (m/44'/60'/0'/0/0) → wallet Ethereum (secp256k1) → assina on-chain
   └── HKDF "...mlkem768-seed"           → chave ML-KEM-768            → cifra arquivos
```

- A **wallet Ethereum** é derivada do mnemônico e conectada direto ao RPC
  (`VITE_RPC_URL`, padrão `http://127.0.0.1:8545`).
- Na rede local, use **Financiar wallet (dev)** para dar gás à wallet. O app
  mostra o **saldo** e só habilita o botão de criptografar quando há saldo > 0.

> A parte on-chain continua usando ECDSA (o Ethereum só aceita secp256k1), mas
> isso é aceitável: os dados on-chain (CID, hash, dono) são **públicos**.
> Quebrar a ECDSA permitiria personificar a conta on-chain, **não** descriptografar
> arquivos — a confidencialidade é responsabilidade da camada PQ (passo 2).

---

### 2. Camada Pós-Quântica (confidencialidade)

Do mesmo mnemônico deriva-se a chave de cifração:

```text
Mnemônico → seed (64 bytes via HKDF) → ML-KEM-768 (FIPS 203) → par de chaves
```

- A chave privada ML-KEM é **derivada deterministicamente** do mnemônico — **não**
  é armazenada no IPFS.
- Como o mnemônico não pode ser reconstruído a partir da chave secp256k1 exposta
  on-chain (derivação unidirecional), **um atacante quântico que quebre a ECDSA
  não recupera os arquivos**.

Proteção em repouso (no dispositivo):

```text
Passphrase do usuário
↓
Argon2id (KDF memory-hard, resistente a quântico)
↓
AES-256-GCM → mnemônico cifrado no localStorage
```

A chave pública fica em claro (para cifrar arquivos sem desbloquear); o
mnemônico só é decifrado ao informar a passphrase.

---

### 3. Encapsulamento do Segredo

O ML-KEM gera um segredo compartilhado.

```text
ML-KEM-768
↓
Shared Secret
```

Esse segredo nunca é armazenado diretamente.

---

### 4. Geração da Chave de Criptografia

O segredo compartilhado é utilizado para gerar uma chave:

```text
AES-256-GCM
```

responsável pela criptografia do arquivo.

```text
ML-KEM Shared Secret
↓
AES-256-GCM Key
```

---

### 5. Criptografia do Arquivo

O arquivo é criptografado localmente no navegador.

```text
Arquivo Original
↓
AES-256-GCM
↓
Arquivo Criptografado
```

O arquivo original nunca sai do dispositivo do usuário.

---

### 6. O que vai para o IPFS

O payload cifrado contém **apenas** o necessário para quem tem a chave privada
ML-KEM (ou seja, a identidade) decifrar:

```text
{ kemCiphertext, fileIv, encryptedFile, originalName, mimeType }
```

A **chave privada NUNCA é armazenada** no payload — diferente de desenhos onde a
chave privada viaja embrulhada junto do arquivo. Assim:

- A confidencialidade depende só da identidade PQ (mnemônico + passphrase).
- O backend não possui acesso à chave nem ao conteúdo.
- O IPFS recebe apenas o conteúdo cifrado.
- Quebrar a wallet (ECDSA) **não** dá acesso aos arquivos.

---

### 7. Upload para IPFS

Apenas o conteúdo criptografado é enviado.

```text
Arquivo Criptografado
↓
IPFS
↓
CID
```

O IPFS nunca recebe o arquivo original.

---

### 8. Registro na Blockchain

Após o upload:

```text
Hash do Conteúdo Criptografado
+
CID
+
Owner
+
Timestamp
```

são registrados em um Smart Contract.

```text
Blockchain
↓
Registro Imutável
```

---

### 9. Recuperação do Arquivo

Quando o usuário deseja recuperar o arquivo:

```text
Passphrase
↓
Argon2id desbloqueia o mnemônico (localStorage)
↓
Deriva Private Key ML-KEM
↓
decap(kemCiphertext) → Shared Secret
↓
Reconstrói chave AES-256-GCM
↓
Descriptografa Arquivo
↓
Download
```

Somente quem tem a identidade PQ (mnemônico + passphrase) consegue realizar esse
processo.

---

## Estrutura

```txt
secure-ipfs-workshop/
├── contracts/
│   └── SecureRegistry.sol
├── scripts/
│   └── deploy.js
├── backend/
├── frontend/
└── README.md
```

---

## Instalação

### Instalar dependências

```bash
npm run install:all
```

### Configurar backend

```bash
cd backend
cp .env.example .env
```

Edite `backend/.env`:

```env
PORT=3333
IPFS_UPLOAD_URL=https://api.ipfs.com.br/upload
IPFS_AUTH_KEY=SUA_CHAVE

# Origens autorizadas a chamar o backend (CORS)
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Tamanho máximo de upload em bytes (padrão 10 MB)
MAX_UPLOAD_BYTES=10485760

# Requisições por minuto por IP (padrão 30)
RATE_LIMIT_MAX=30

# Token opcional: se definido, o cliente deve enviar o header x-upload-token.
# Vazio = proxy aberto (apenas uso local).
UPLOAD_ACCESS_TOKEN=
```

### Executar blockchain local

```bash
npm run node
```

### Deploy do contrato

```bash
npm run deploy:local
```

Copie o endereço retornado.

### Configurar frontend

```bash
cd frontend
cp .env.example .env
```

Edite `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:3333
VITE_CONTRACT_ADDRESS=ENDERECO_DO_CONTRATO

# RPC para a wallet interna derivada do mnemônico
VITE_RPC_URL=http://127.0.0.1:8545

# Opcional: deve ser igual ao UPLOAD_ACCESS_TOKEN do backend, se definido
VITE_UPLOAD_TOKEN=
```

> Importante: o Vite só lê o `.env` na inicialização. Se alterar o
> `VITE_CONTRACT_ADDRESS` (por exemplo após reimplantar o contrato), **reinicie
> o dev server do frontend**.

### Executar aplicação

Backend:

```bash
npm run backend
```

Frontend:

```bash
npm run frontend
```

### Primeiro uso

1. No app, em **"0. Identidade Pós-Quântica"**, defina uma passphrase e clique
   em **Criar identidade PQ** (já fica desbloqueada).
2. **Anote as 24 palavras** exibidas — é o único backup. Sem elas (e a
   passphrase) os arquivos não podem ser recuperados.
3. A **wallet interna** (derivada do mnemônico) aparece na tela. Na rede local,
   clique em **Financiar wallet (dev)** para enviar 1 ETH de gás a ela (usa a
   conta #0 do Hardhat).
4. Faça o upload normalmente — o registro on-chain é assinado pela wallet interna.
5. Para usar em outro dispositivo: **Restaurar de um mnemônico**, defina uma
   passphrase nova e desbloqueie.

---

## Rede local (Hardhat)

A wallet vem do mnemônico e conecta direto no RPC:

```txt
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
```

O gás da wallet interna na rede local vem da conta #0 do Hardhat, via botão
**Financiar wallet (dev)**.

---

## Segurança

### Criptografia Pós-Quântica

Este projeto utiliza:

```text
ML-KEM-768 (FIPS 203)
```

padrão aprovado pelo NIST para proteção contra ataques de computadores quânticos.

### Criptografia Híbrida

```text
ML-KEM-768
↓
Shared Secret
↓
AES-256-GCM
↓
Arquivo
```

### Proteção contra Harvest Now, Decrypt Later

O cenário a evitar:

```text
Harvest Now, Decrypt Later
(Coletar Agora, Descriptografar Depois)
```

onde um atacante coleta o conteúdo cifrado hoje para quebrá-lo no futuro com
computadores quânticos. Esta versão protege contra isso **de ponta a ponta**,
porque **nenhuma** parte da decifração depende de criptografia de chave pública
clássica:

| Componente | Resiste a quântico? | Por quê |
| --- | --- | --- |
| ML-KEM-768 (troca de chave) | ✅ | FIPS 203 |
| AES-256-GCM (arquivo) | ✅ | Grover só reduz 256→128 bits |
| Seed protegido por Argon2id + passphrase | ✅ | KDF simétrico, sem chave pública |
| Identidade independente da ECDSA da wallet | ✅ | quebrar a wallet não dá os arquivos |

### Autocustódia

- O backend não possui acesso ao conteúdo dos arquivos.
- O backend não possui acesso às chaves de descriptografia.
- O IPFS recebe apenas conteúdo criptografado.
- Apenas quem tem a identidade PQ (mnemônico + passphrase) recupera o arquivo.
- Perder o mnemônico **e** a passphrase = perda irreversível dos arquivos.

### Proteções do Backend (Proxy IPFS)

- **CORS** restrito a uma allowlist (`ALLOWED_ORIGINS`).
- **Limite de tamanho** de upload (`MAX_UPLOAD_BYTES`) para evitar DoS por memória.
- **Rate limiting** por IP (`RATE_LIMIT_MAX`).
- **Token de acesso** opcional (`UPLOAD_ACCESS_TOKEN` / header `x-upload-token`).
- Erros não vazam stack traces ao cliente.

### Limitações conhecidas

Projeto **educacional**. Antes de uso em produção, considere:

- O registro on-chain (`register`) é suscetível a *front-running* no mempool;
  para produção use um esquema *commit-reveal*.
- Conteúdo no IPFS é público e permanente — a confidencialidade depende
  inteiramente da criptografia client-side.
- O proxy de upload deve rodar com `UPLOAD_ACCESS_TOKEN` definido em qualquer
  deploy exposto à internet.

---

## Tecnologias

- React
- Vite
- Ethers.js
- Hardhat
- Solidity
- IPFS
- ML-KEM-768 (FIPS 203)
- AES-256-GCM
- BIP-39 (mnemônico) + HKDF
- Argon2id (proteção em repouso)
- Blockchain Registry

## Licença

MIT
