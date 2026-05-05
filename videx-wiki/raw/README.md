# raw/

Drop source documents here for ingestion: articles, PDFs, screenshots, transcripts, exported notes, code snippets, API docs, anything.

**Rules:**
- Files here are immutable. The LLM reads but never edits, renames, or deletes.
- Use descriptive `kebab-case` filenames where possible. Originals are fine if not.
- Subfolders are allowed (e.g. `raw/sa-api/`, `raw/screenshots/`) — group however suits you.

To ingest: ask the LLM to "ingest `raw/{filename}`". See [../AGENTS.md](../AGENTS.md) for the workflow.
