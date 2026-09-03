from app.routers.projects import _compute_stats


def test_compute_stats_counts_active_projects_and_clients():
    projects = [
        {"status": "active", "progress": 60},
        {"status": "active", "progress": 80},
        {"status": "completed", "progress": 100},
    ]
    clients = [{"status": "active"}, {"status": "active"}, {"status": "churned"}]
    events_count = 5

    stats = _compute_stats(projects, clients, events_count)

    assert stats == {
        "active_projects": 2,
        "active_clients": 2,
        "commits_this_week": 5,
        "avg_progress": 70,  # (60 + 80) / 2, only active projects
    }


def test_compute_stats_handles_zero_active_projects():
    stats = _compute_stats([], [], 0)
    assert stats["avg_progress"] == 0
    assert stats["active_projects"] == 0
