"""
VeriChainIDS Cardano submitter.

This service receives evidence metadata from the ASP.NET backend, signs a
self-transfer transaction, attaches metadata label 674, submits it through
Blockfrost, and returns the Cardano TxHash.
"""

from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from blockfrost import ApiUrls
from pycardano import (
    Address,
    AlonzoMetadata,
    AuxiliaryData,
    BlockFrostChainContext,
    Metadata,
    Network,
    PaymentSigningKey,
    PaymentVerificationKey,
    TransactionBuilder,
    TransactionOutput,
)


ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / "Blockchain" / ".env")


def load_backend_cardano_config() -> dict[str, Any]:
    appsettings_path = ROOT_DIR / "Backend" / "VeriChainIDS.API" / "appsettings.json"
    if not appsettings_path.exists():
        return {}
    try:
        data = json.loads(appsettings_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    cardano = data.get("Cardano")
    return cardano if isinstance(cardano, dict) else {}


BACKEND_CARDANO_CONFIG = load_backend_cardano_config()


class SubmitRequest(BaseModel):
    recordType: str = Field(default="Evidence")
    entityId: str = Field(default="")
    label: int | str = Field(default=674)
    metadata: dict[str, Any]


class SubmitResponse(BaseModel):
    txHash: str
    TxHash: str
    network: str
    label: int
    explorerUrl: str


app = FastAPI(title="VeriChainIDS Cardano Submitter", version="1.0.0")


def env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is not None and value.strip():
        return value.strip()

    fallback_keys = {
        "BLOCKFROST_PROJECT_ID": "BlockfrostProjectId",
        "CARDANO_NETWORK": "Network",
        "CARDANO_METADATA_LABEL": "MetadataLabel",
    }
    backend_key = fallback_keys.get(name)
    if backend_key:
        backend_value = BACKEND_CARDANO_CONFIG.get(backend_key)
        if backend_value is not None and str(backend_value).strip():
            return str(backend_value).strip()

    return default.strip()


def resolve_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT_DIR / path


def get_network_name() -> str:
    network = env("CARDANO_NETWORK", "preview").lower()
    if network not in {"preview", "preprod", "mainnet"}:
        raise HTTPException(status_code=500, detail=f"Unsupported CARDANO_NETWORK: {network}")
    return network


def get_network() -> Network:
    return Network.MAINNET if get_network_name() == "mainnet" else Network.TESTNET


def get_blockfrost_base_url() -> str:
    network = get_network_name()
    fallback_urls = {
        "mainnet": "https://cardano-mainnet.blockfrost.io/api/v0",
        "preprod": "https://cardano-preprod.blockfrost.io/api/v0",
        "preview": "https://cardano-preview.blockfrost.io/api/v0",
    }
    api_url = getattr(ApiUrls, network, None)
    return api_url.value if api_url is not None else fallback_urls[network]


def get_project_id() -> str:
    project_id = env("BLOCKFROST_PROJECT_ID")
    if not project_id:
        raise HTTPException(status_code=500, detail="BLOCKFROST_PROJECT_ID is missing.")
    return project_id


def load_signing_key() -> PaymentSigningKey:
    skey_path = resolve_path(env("CARDANO_SIGNING_KEY_PATH", "Blockchain/wallet/payment.skey"))
    if not skey_path.exists():
        raise HTTPException(status_code=500, detail=f"Signing key not found: {skey_path}")
    return PaymentSigningKey.load(str(skey_path))


def load_address(signing_key: PaymentSigningKey) -> Address:
    address_path = resolve_path(env("CARDANO_ADDRESS_PATH", "Blockchain/wallet/payment.addr"))
    if address_path.exists():
        raw_address = address_path.read_text(encoding="utf-8").strip()
        if raw_address:
            return Address.from_primitive(raw_address)

    verification_key = PaymentVerificationKey.from_signing_key(signing_key)
    return Address(payment_part=verification_key.hash(), network=get_network())


def truncate_utf8(value: str, max_bytes: int = 64) -> str:
    encoded = value.encode("utf-8")
    if len(encoded) <= max_bytes:
        return value

    output = bytearray()
    for char in value:
        encoded_char = char.encode("utf-8")
        if len(output) + len(encoded_char) > max_bytes:
            break
        output.extend(encoded_char)
    return output.decode("utf-8")


def chunk_utf8(value: str, max_bytes: int = 64) -> list[str]:
    chunks: list[str] = []
    current = bytearray()
    for char in value:
        encoded_char = char.encode("utf-8")
        if len(encoded_char) > max_bytes:
            continue
        if current and len(current) + len(encoded_char) > max_bytes:
            chunks.append(current.decode("utf-8"))
            current = bytearray()
        current.extend(encoded_char)
    if current:
        chunks.append(current.decode("utf-8"))
    return chunks or [""]


def sanitize_metadata(value: Any, key_context: str = "") -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        if key_context == "hash" and len(value.encode("utf-8")) <= 64:
            return value
        if len(value.encode("utf-8")) <= 64:
            return value
        return chunk_utf8(value)
    if isinstance(value, list):
        return [sanitize_metadata(item, key_context) for item in value]
    if isinstance(value, dict):
        sanitized: dict[Any, Any] = {}
        for raw_key, raw_value in value.items():
            key = raw_key if isinstance(raw_key, int) else truncate_utf8(str(raw_key), 64)
            sanitized[key] = sanitize_metadata(raw_value, str(raw_key))
        return sanitized
    return sanitize_metadata(str(value), key_context)


def get_context() -> BlockFrostChainContext:
    return BlockFrostChainContext(
        project_id=get_project_id(),
        base_url=get_blockfrost_base_url(),
    )


def explorer_url(tx_hash: str) -> str:
    network = get_network_name()
    if network == "mainnet":
        return f"https://cardanoscan.io/transaction/{tx_hash}"
    return f"https://{network}.cardanoscan.io/transaction/{tx_hash}"


def parse_label(value: int | str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Metadata label must be an integer.") from exc


@app.get("/health")
def health() -> dict[str, Any]:
    signing_key_exists = resolve_path(env("CARDANO_SIGNING_KEY_PATH", "Blockchain/wallet/payment.skey")).exists()
    address_path = resolve_path(env("CARDANO_ADDRESS_PATH", "Blockchain/wallet/payment.addr"))
    return {
        "ok": True,
        "network": get_network_name(),
        "hasBlockfrostProjectId": bool(env("BLOCKFROST_PROJECT_ID")),
        "hasSigningKey": signing_key_exists,
        "hasAddressFile": address_path.exists(),
    }


@app.get("/wallet/status")
def wallet_status() -> dict[str, Any]:
    signing_key = load_signing_key()
    address = load_address(signing_key)
    context = get_context()
    utxos = context.utxos(str(address))
    balance = sum(utxo.output.amount.coin for utxo in utxos)
    return {
        "network": get_network_name(),
        "address": str(address),
        "utxoCount": len(utxos),
        "lovelace": balance,
        "ada": balance / 1_000_000,
        "funded": balance > 3_000_000,
    }


@app.post("/submit", response_model=SubmitResponse)
def submit(request: SubmitRequest) -> SubmitResponse:
    label = parse_label(request.label or env("CARDANO_METADATA_LABEL", "674"))
    signing_key = load_signing_key()
    address = load_address(signing_key)
    context = get_context()

    metadata_body = sanitize_metadata(request.metadata)
    auxiliary_data = AuxiliaryData(
        AlonzoMetadata(
            metadata=Metadata(
                {
                    label: metadata_body,
                }
            )
        )
    )

    min_output_lovelace = int(env("CARDANO_MIN_OUTPUT_LOVELACE", "2000000"))

    builder = TransactionBuilder(context, auxiliary_data=auxiliary_data)
    builder.add_input_address(address)
    builder.add_output(TransactionOutput(address, min_output_lovelace))

    try:
        signed_tx = builder.build_and_sign([signing_key], change_address=address)
        context.submit_tx(signed_tx)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cardano submit failed: {exc}") from exc

    tx_hash = str(signed_tx.id)
    return SubmitResponse(
        txHash=tx_hash,
        TxHash=tx_hash,
        network=get_network_name(),
        label=label,
        explorerUrl=explorer_url(tx_hash),
    )
