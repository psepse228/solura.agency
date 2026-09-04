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


def test_non_ascii_filename_produces_an_ascii_only_storage_key():
    # Supabase Storage rejects non-ASCII bytes in an object key (400
    # InvalidKey) -- real КП/presentation filenames routinely have exactly
    # this shape. The storage key must stay ASCII-only; the original
    # filename is preserved separately in the documents table, not here.
    result = unique_storage_path("proj-1", "Argus — коммерческое предложение.html", set())
    assert result.startswith("proj-1/")
    assert result.endswith(".html")
    assert result.encode("ascii")  # raises UnicodeEncodeError if not pure ASCII


def test_non_ascii_filenames_that_collide_after_sanitizing_still_get_unique_paths():
    # Two different original filenames could sanitize down to the same
    # ASCII stem -- the collision handling must still apply after
    # sanitization, not just on the raw filename.
    first = unique_storage_path("proj-1", "Отчёт.pdf", set())
    second = unique_storage_path("proj-1", "Отчет!.pdf", {first})
    assert first != second
    assert second.endswith(".pdf")
