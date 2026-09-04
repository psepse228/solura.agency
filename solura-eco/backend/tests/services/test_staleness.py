from datetime import datetime, timedelta, timezone

from app.services.staleness import days_since_activity, is_stale

NOW = datetime(2026, 9, 4, 12, 0, 0, tzinfo=timezone.utc)


def test_days_since_activity_is_none_when_never_active():
    assert days_since_activity(None, NOW) is None


def test_days_since_activity_computes_whole_days():
    three_days_ago = NOW - timedelta(days=3)
    assert days_since_activity(three_days_ago, NOW) == 3


def test_days_since_activity_rounds_down_for_partial_days():
    almost_two_days = NOW - timedelta(days=1, hours=23)
    assert days_since_activity(almost_two_days, NOW) == 1


def test_is_stale_true_when_never_active():
    assert is_stale(None) is True


def test_is_stale_false_below_threshold():
    assert is_stale(6) is False


def test_is_stale_true_at_threshold():
    assert is_stale(7) is True


def test_is_stale_respects_custom_threshold():
    assert is_stale(3, threshold_days=3) is True
    assert is_stale(2, threshold_days=3) is False
