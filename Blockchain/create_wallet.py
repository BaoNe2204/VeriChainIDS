"""
Create a Cardano testnet wallet for VeriChainIDS blockchain evidence anchoring.

The generated signing key is private. Keep Blockchain/wallet/payment.skey local
and never commit or share it.
"""

from __future__ import annotations

from pathlib import Path

from pycardano import Address, Network, PaymentSigningKey, PaymentVerificationKey


WALLET_DIR = Path(__file__).resolve().parent / "wallet"
SKEY_PATH = WALLET_DIR / "payment.skey"
VKEY_PATH = WALLET_DIR / "payment.vkey"
ADDR_PATH = WALLET_DIR / "payment.addr"


def main() -> None:
    WALLET_DIR.mkdir(parents=True, exist_ok=True)

    if SKEY_PATH.exists() or VKEY_PATH.exists() or ADDR_PATH.exists():
        raise SystemExit(
            "Wallet files already exist. Move or delete Blockchain/wallet first "
            "if you intentionally want to create a new wallet."
        )

    signing_key = PaymentSigningKey.generate()
    signing_key.save(str(SKEY_PATH))

    verification_key = PaymentVerificationKey.from_signing_key(signing_key)
    verification_key.save(str(VKEY_PATH))

    address = Address(payment_part=verification_key.hash(), network=Network.TESTNET)
    ADDR_PATH.write_text(str(address), encoding="utf-8")

    print("Created Cardano testnet wallet:")
    print(f"  signing key: {SKEY_PATH}")
    print(f"  verification key: {VKEY_PATH}")
    print(f"  address: {ADDR_PATH}")
    print()
    print(str(address))
    print()
    print("Fund this address with Preview tADA before submitting transactions.")


if __name__ == "__main__":
    main()
