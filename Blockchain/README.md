# VeriChainIDS Cardano Submitter

This service turns VeriChainIDS evidence hashes into real Cardano transaction metadata.

Backend flow:

```text
ASP.NET Backend -> POST http://127.0.0.1:8090/submit
Cardano Submitter -> signs metadata transaction
Blockfrost Preview -> returns TxHash
Dashboard -> shows Cardanoscan proof
```

## 1. Install Python packages

Use Python 3.11+.

```powershell
cd G:\hackathon\VeriChainIDS
python -m venv Blockchain\.venv
Blockchain\.venv\Scripts\python.exe -m pip install -r Blockchain\requirements.txt
```

If `python` opens Microsoft Store on Windows, install Python from python.org or use an existing Python path.

## 2. Create wallet

You can use this repo's PyCardano wallet script:

```powershell
Blockchain\.venv\Scripts\python.exe Blockchain\create_wallet.py
```

It creates:

```text
Blockchain/wallet/payment.skey
Blockchain/wallet/payment.vkey
Blockchain/wallet/payment.addr
```

Never share or commit `payment.skey`.

## 3. Fund wallet with Preview tADA

Open:

```text
Blockchain/wallet/payment.addr
```

Copy the `addr_test...` address and request **Preview** tADA from the Cardano faucet.

## 4. Configure submitter

If `Blockchain\.env` is missing, the submitter will reuse the backend Cardano config from:

```text
Backend/VeriChainIDS.API/appsettings.json
```

So for the current hackathon setup, you only need wallet files in `Blockchain/wallet`.

Optional explicit config:

Copy:

```powershell
Copy-Item Blockchain\.env.example Blockchain\.env
```

Edit `Blockchain\.env`:

```env
BLOCKFROST_PROJECT_ID=preview_your_real_project_id
CARDANO_NETWORK=preview
CARDANO_SIGNING_KEY_PATH=Blockchain/wallet/payment.skey
CARDANO_ADDRESS_PATH=Blockchain/wallet/payment.addr
CARDANO_METADATA_LABEL=674
PORT=8090
```

The Blockfrost project must match `CARDANO_NETWORK`. Your current key is a **Preview** key, so keep `preview`.

## 5. Run submitter

```powershell
Blockchain\.venv\Scripts\python.exe -m uvicorn Blockchain.submitter:app --host 127.0.0.1 --port 8090
```

Health check:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/health
```

Wallet balance check:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/wallet/status
```

`funded` must be `true` before a transaction can be submitted.

## 6. Backend settings

Backend must point to this submitter:

```json
"Cardano": {
  "Network": "preview",
  "SubmissionMode": "External",
  "SubmitEndpoint": "http://127.0.0.1:8090/submit",
  "BlockfrostProjectId": "preview..."
}
```

## 7. Demo

Run all three services:

```text
Backend:   http://127.0.0.1:5000
Frontend:  http://127.0.0.1:3000
Submitter: http://127.0.0.1:8090
```

Create a new alert. The backend will submit the evidence hash, save the returned TxHash in `BlockchainRecords`, and the dashboard will show the Cardano proof.
