# Secure IPFS Workshop

Demo desenvolvido para o workshop:

**Construindo Aplicações Seguras com Blockchain e IPFS**

## Arquitetura

```text
Arquivo
↓
Criptografia Client-Side
↓
ML-KEM-768 (Pós-Quântico)
↓
AES-256-GCM
↓
IPFS
↓
Hash do Conteúdo Criptografado
↓
Blockchain Registry
```

Todo o processo de criptografia ocorre no navegador.

O backend atua apenas como proxy para proteger a chave de acesso ao serviço IPFS.

---

## Fluxo Completo

### 1. Conexão da Wallet

O usuário conecta sua wallet Web3 (MetaMask).

```text
MetaMask
↓
Autenticação do Usuário
```

A wallet é utilizada para proteger o acesso ao material criptográfico utilizado na recuperação dos arquivos.

---

### 2. Geração das Chaves Pós-Quânticas

O navegador gera um par de chaves utilizando:

```text
ML-KEM-768 (FIPS 203)
```

Algoritmo padronizado pelo NIST para proteção contra ataques de computadores quânticos.

```text
Public Key
+
Private Key
```

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

### 6. Proteção da Chave Pós-Quântica

A chave privada ML-KEM é protegida utilizando uma chave derivada da wallet.

```text
Wallet
↓
Wallet Wrapping Key
↓
Private Key ML-KEM Protegida
```

Dessa forma:

- Apenas a mesma wallet consegue recuperar a chave.
- O backend não possui acesso à chave.
- O IPFS não possui acesso à chave.

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
Wallet
↓
Desprotege Private Key ML-KEM
↓
Recupera Shared Secret
↓
Reconstrói AES-256-GCM
↓
Descriptografa Arquivo
↓
Download
```

Somente a wallet correta consegue realizar esse processo.

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
```

### Executar aplicação

Backend:

```bash
npm run backend
```

Frontend:

```bash
npm run frontend
```

---

## MetaMask

Adicione a rede local Hardhat:

```txt
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency Symbol: ETH
```

Importe uma das contas exibidas pelo comando:

```bash
npm run node
```

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

O uso de ML-KEM-768 reduz riscos do cenário:

```text
Harvest Now, Decrypt Later
(Coletar Agora, Descriptografar Depois)
```

onde um atacante coleta dados hoje para tentar quebrá-los futuramente utilizando computadores quânticos.

### Autocustódia

- O backend não possui acesso ao conteúdo dos arquivos.
- O backend não possui acesso às chaves de descriptografia.
- O IPFS recebe apenas conteúdo criptografado.
- Apenas a wallet do usuário consegue recuperar o arquivo.

---

## Tecnologias

- React
- Vite
- Ethers.js
- Hardhat
- Solidity
- MetaMask
- IPFS
- ML-KEM-768 (FIPS 203)
- AES-256-GCM
- Blockchain Registry

## Licença

MIT
````
