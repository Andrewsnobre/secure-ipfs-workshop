# Secure IPFS Workshop

Demo para workshop: **Construindo Aplicações Seguras com Blockchain e IPFS**.

Fluxo:

1. Arquivo é criptografado no navegador.
2. Conteúdo criptografado é enviado para `https://api.ipfs.com.br/upload`.
3. Backend autentica usando header `Authorization` com API key pura.
4. Frontend calcula hash do conteúdo criptografado.
5. Wallet assina o hash.
6. Smart contract registra `hash + CID + assinatura + owner`.
7. Qualquer pessoa pode verificar o registro on-chain.

## Estrutura

```txt
secure-ipfs-workshop/
├── contracts/SecureRegistry.sol
├── scripts/deploy.js
├── backend/
└── frontend/
```

## 1. Instalar dependências

```bash
npm run install:all
```

## 2. Configurar backend

```bash
cd backend
cp .env.example .env
```

Edite `backend/.env`:

```env
PORT=3333
IPFS_UPLOAD_URL=https://api.ipfs.com.br/upload
IPFS_AUTH_KEY=SUA_KEY_AQUI
```

Importante: a API key não deve ficar no frontend em produção.

## 3. Rodar blockchain local

Em um terminal:

```bash
npm run node
```

## 4. Deploy do contrato

Em outro terminal:

```bash
npm run deploy:local
```

Copie o endereço exibido.

## 5. Configurar frontend

```bash
cd frontend
cp .env.example .env
```

Edite `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:3333
VITE_CONTRACT_ADDRESS=ENDERECO_DO_CONTRATO
```

## 6. Rodar backend e frontend

Terminal backend:

```bash
npm run backend
```

Terminal frontend:

```bash
npm run frontend
```

Abra o endereço do Vite no navegador.

## Observação para MetaMask local

Adicione a rede local:

- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency: `ETH`

Importe uma conta gerada pelo Hardhat usando a private key exibida no terminal do `hardhat node`.

## Ponto de segurança para explicar no workshop

Este projeto usa backend proxy para proteger a API key do IPFS. O frontend nunca deve enviar diretamente o header `Authorization` com a chave real em produção.
