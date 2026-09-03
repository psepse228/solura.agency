from app.services.document_paths import unique_storage_path


def test_returns_simple_path_when_no_collision():
    result = unique_storage_path("proj-1", "proposal.pdf", set())
    assert result == "proj-1/proposal.pdf"


def test_suffixes_filename_on_collision_keeping_extension():
    existing = {"proj-1/proposal.pdf"}
    result = unique_storage_path("proj-1", "proposal.pdf", existing)
    assert result != "proj-1/proposal.pdf"
    assert result.startswith("proj-1/proposal-")
    assert result.endswith(".pdf")


def test_suffixes_filename_without_extension_on_collision():
    existing = {"proj-1/README"}
    result = unique_storage_path("proj-1", "README", existing)
    assert result != "proj-1/README"
    assert result.startswith("proj-1/README-")


def test_different_projects_never_collide_on_the_same_filename():
    existing = {"proj-1/proposal.pdf"}
    result = unique_storage_path("proj-2", "proposal.pdf", existing)
    assert result == "proj-2/proposal.pdf"
