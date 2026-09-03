from app.auth.passwords import hash_password, verify_password


def test_verify_password_matches_correct_plaintext():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)


def test_verify_password_rejects_wrong_plaintext():
    hashed = hash_password("correct horse battery staple")
    assert not verify_password("wrong password", hashed)


def test_hash_password_produces_different_hashes_for_same_input():
    # bcrypt salts each hash -- two hashes of the same password must differ
    assert hash_password("same") != hash_password("same")
