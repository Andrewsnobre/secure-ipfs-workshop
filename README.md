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

A chave privada ML-KEM é protegida (wrapped) com uma chave AES derivada de uma
**assinatura da wallet**, não de dados públicos.

```text
Wallet assina mensagem (personal_sign, ECDSA determinística)
↓
HKDF-SHA256(assinatura, salt = chainId + endereço)
↓
Wallet Wrapping Key (AES-256-GCM)
↓
Private Key ML-KEM Protegida
```

A assinatura só pode ser produzida por quem controla a chave privada da wallet.
O endereço e o chainId entram apenas como *domain separation* (salt), nunca como
segredo. Dessa forma:

- Apenas a mesma wallet consegue reproduzir a assinatura e recuperar a chave.
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
- MetaMask
- IPFS
- ML-KEM-768 (FIPS 203)
- AES-256-GCM
- Blockchain Registry

## Licença

MIT
