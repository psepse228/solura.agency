import pytest
from cryptography.fernet import Fernet, InvalidToken

from app.services.canvas_token_crypto import decrypt_token, encrypt_token

TEST_KEY = Fernet.generate_key()


def test_round_trips_a_token():
    original = "canvas-token-abc123"
    encrypted = encrypt_token(original, TEST_KEY)
    assert encrypted != original.encode()
    assert decrypt_token(encrypted, TEST_KEY) == original


def test_encrypting_twice_produces_different_ciphertext():
    # Fernet includes a random component per encryption -- two encryptions
    # of the same plaintext must not be byte-identical.
    a = encrypt_token("same-token", TEST_KEY)
    b = encrypt_token("same-token", TEST_KEY)
    assert a != b


def test_wrong_key_fails_to_decrypt():
    encrypted = encrypt_token("secret", TEST_KEY)
    wrong_key = Fernet.generate_key()
    with pytest.raises(InvalidToken):
        decrypt_token(encrypted, wrong_key)
