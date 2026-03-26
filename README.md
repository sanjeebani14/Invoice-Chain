# InvoiceChain - A Decentralized Marketplace for Fractionalized SME Receivables

## Project summary

InvoiceChain is a decentralized marketplace that enables Small and Medium Enterprises (SMEs) to tokenize their outstanding invoices as ERC-1155 multi-token assets on blockchain, providing immediate liquidity while offering investors fractional ownership opportunities in revenue-generating receivables.
 
Traditional invoice factoring is slow and dominated by large financial intermediaries who charge high fees. InvoiceChain puts the entire workflow on-chain : from invoice minting to trading, settlement, and escrow - making the process transparent, automated, and accessible to any business regardless of size.

## Problem statement and existing challenges

Invoice factoring - the practice of selling outstanding invoices at a discount in exchange for immediate cash has a huge market. Yet the process remains fundamentally broken for the businesses that need it most: small and medium enterprises. 
The traditional invoice factoring process involves a financial intermediary (a 'factor') who purchases the invoice from the SME at a discount, advances cash immediately, and then collects the full amount from the buyer when it is due. On paper, this sounds ideal. In practice, it has a number of inefficiencies:

- SMEs apply to banks or factoring companies. This requires credit history, financial statements and audited accounts.
- Banks reject 50-55% of SME loan/factoring applications globally.
- In India, a very small percentage of MSMEs have access to formal credit.
- Even when SMEs do qualify, the cost is huge:
  - Factor fees: 1.5% to 5%
  - Processing fees, due diligence fees, legal fees can add another 1–3%.
  - For a razor-thin margin business, this can eliminate the entire profit from a transaction.
- Buyer pays the factor directly. This process is not transparent, SME has no visibility into collection status.
-  Invoice fraud is a massive and growing problem in the factoring industry:
  - Duplicate invoice fraud: the same invoice submitted to multiple lenders or factors simultaneously.
  - Ghost invoice fraud: entirely fabricated invoices with no underlying transaction.
- A typical invoice factoring transaction involves:
  - Physical or scanned document submission
  - Manual data entry and verification by the factor's team
  - Legal review of invoice validity
  - Bank wire transfers
  - Manual reconciliation at settlement

  This entire process can take 7-21 days, defeating the purpose of 'fast liquidity'.

## How InvoiceChain does it

- Permissionless Access via Wallet Authentication - Instead of credit applications, financial statements, and eligibility checks:
  - Any user registers with an email and connects a MetaMask wallet.
  - KYC is handled via document upload and admin verification, a one-time process.
  - Once KYC-verified, an SME can upload and tokenize any invoice immediately.
- AI-Powered OCR Pipeline (Eliminating Manual Processing)
  - SME uploads a PDF or photo of the invoice.
  - PyMuPDF + OpenCV preprocesses: deskews, denoises, binarizes the image.
  - Tesseract OCR extracts: invoice number, client name, amount, due date.
  - Confidence scoring flags low-quality extractions for manual correction.
  - Total processing time: under 2 minutes vs. 7-21 days in traditional factoring.
- On-Chain Fraud Prevention (keccak256 Hash Registry)
  -  After OCR, fields are canonicalized (normalized, lowercased, deduplicated).
  -  A keccak256 hash of the canonical string is generated - a unique fingerprint of the invoice.
  -  Before minting, the smart contract checks: has this hash ever been registered?
  - If yes: transaction reverts with 'Duplicate invoice'.
  - If no: hash recorded on-chain permanently - no future system can accept this invoice again.
- Transparent Marketplace with Risk Scoring
  - All listings are public on the marketplace - any investor can browse, filter, and analyze.
  - Each invoice has a multi-factor risk score (0–100) computed from: payment history, client reputation, seller track record, invoice age, industry risk.
  - Machine learning anomaly detection flags unusual patterns before they reach the marketplace.
  - Investors see the full ownership history on-chain, no information asymmetry.
- Smart Contract Escrow (Eliminating Counterparty Risk)
  - When an investor purchases an invoice, funds go into a smart contract escrow - not to a company.
  - The smart contract releases funds to the SME only when ownership transfer is confirmed.
- Auction & Fractional Ownership (Democratizing Investment)
  - Auction mechanism: price discovery through competitive bidding — no more take-it-or-leave-it factor rates.
  - Fractional shares: an invoice can be split into shares - retail accessible.



## Monorepo Structure

- `backend/` FastAPI app, ML scripts, tests, and data seed/training scripts
- `frontend/` Next.js app (App Router)
- `blockchain/` Hardhat contracts, deployment scripts, and deployment artifacts
- `docker-compose.yml` local Redis + MinIO services

## Prerequisites

Install the following before setup:
- Node.js 20+ and npm
- Python 3.11+ (3.13 is also supported for most packages in this repo)
- Docker Desktop (for Redis/MinIO)
- PostgreSQL 15+ (local install or cloud DB like Neon)
- MetaMask (for wallet-based features)

## 1. Clone and Install Dependencies

From repository root:

```bash
git clone <your-repo-url>
cd Invoice-Chain
```

Install JS dependencies:

```bash
npm install
cd frontend && npm install
cd ../blockchain && npm install
cd ..
```

Create a Python virtual environment and install backend dependencies:

```bash
cd backend
python -m venv .venv
# Windows (Git Bash)
source .venv/Scripts/activate
# Windows (PowerShell)
# .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
cd ..
```

## 2. Start Infrastructure (Redis + MinIO)

From repository root:

```bash
docker compose up -d redis minio
```

This starts:
- Redis on `localhost:6379`
- MinIO API on `localhost:9000`
- MinIO Console on `localhost:9001`

Default MinIO credentials (from compose):
- User: `invoicechain`
- Password: `invoicechain123`

### PostgreSQL

Postgres is currently commented out in `docker-compose.yml`, so use :
- A cloud Postgres URL via `DATABASE_URL`(neon)

## 3. Configure Environment Variables

No `.env` templates are committed, so create these manually.

### 3.1 backend/.env

todo - env.example
Create `backend/.env`:

```env
# App
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
CORS_EXTRA_ORIGINS=

# Auth
SECRET_KEY=replace-with-a-long-random-secret
ALGORITHM=HS256

# Database (choose one approach)
# Option A: single URL (recommended)
DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/invoice_chain_db

# Option B: component values (used if DATABASE_URL is empty)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=invoice_chain_db

# Email (optional in local dev unless testing email features)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SENDER_EMAIL=noreply@invoicechain.com

# Invoice upload/storage
INVOICE_STORAGE_MODE=local
RL_UPLOAD_LIMIT=15
RL_UPLOAD_WINDOW_SECONDS=300
MALWARE_SCAN_STRICT=false

# S3/MinIO (required if INVOICE_STORAGE_MODE=s3)
S3_ENDPOINT_URL=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=invoicechain-uploads

# Wallet / blockchain integration
WEB3_PROVIDER_URL=http://127.0.0.1:8545
BLOCKCHAIN_RPC_URL=https://sepolia.base.org
INVOICE_NFT_CONTRACT_ADDRESS=
MINTER_PRIVATE_KEY=

# Blockchain sync worker
BLOCKCHAIN_SYNC_ENABLED=false
BLOCKCHAIN_SYNC_INTERVAL_SECONDS=30
BLOCKCHAIN_SYNC_START_BLOCK=latest
```

Notes:
- `backend/app/database.py` loads `backend/.env` automatically.
- If `DATABASE_URL` is set, the individual `POSTGRES_*` fields are ignored.

### 3.2 frontend/.env.local

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_ORIGIN=http://localhost:8000
NEXT_PUBLIC_RPC_PROVIDER=https://sepolia.base.org
NEXT_PUBLIC_EXPECTED_CHAIN_ID=84532
NEXT_PUBLIC_BLOCK_EXPLORER_BASE_URL=https://sepolia.basescan.org
```

### 3.3 blockchain/.env

Create `blockchain/.env`:

```env
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=your_0x_private_key
```

## 4. Run the Backend

From `backend/`:

```bash
source .venv/Scripts/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend health:
- `GET http://localhost:8000/` should return a JSON health message.
- API base router is mounted under `/api/v1`.

## 5. Run the Frontend

From `frontend/`:

```bash
npm run dev
```

Open:
- `http://localhost:3000`

## 6. Blockchain Setup (Optional but recommended)

If you only need UI/API flows, you can skip deployment initially. For on-chain flows:

### Compile and test contracts

From `blockchain/`:

```bash
npx hardhat compile
npx hardhat test
```

### Deploy to Base Sepolia

```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

Deployment artifacts are written to:
- `blockchain/deployments/baseSepolia.json`
- `blockchain/deployments/addresses.ts`

Use deployed values to populate backend env fields, especially:
- `INVOICE_NFT_CONTRACT_ADDRESS`
- `MINTER_PRIVATE_KEY`





