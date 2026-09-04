from app.services.phone import normalize_phone


def test_strips_spaces_and_dashes():
    assert normalize_phone("+1 (555) 123-4567") == "+15551234567"


def test_adds_leading_plus_if_missing():
    assert normalize_phone("15551234567") == "+15551234567"


def test_keeps_existing_leading_plus():
    assert normalize_phone("+998901234567") == "+998901234567"


def test_strips_internal_parens_and_spaces_from_synced_contact():
    assert normalize_phone("+998 (90) 123 45 67") == "+998901234567"
