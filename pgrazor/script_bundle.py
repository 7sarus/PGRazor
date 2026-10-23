"""Deterministic, build-time composition of runtime scripts (no runtime imports)."""
import json
from pathlib import Path


def bundle(root: Path, name: str) -> bytes:
    root = root.resolve()
    manifest = json.loads((root / 'runtime/bundles.json').read_text(encoding='utf-8'))
    parts = []
    for relative in manifest[name]:
        source = (root / relative).resolve()
        if not source.is_relative_to(root):
            raise ValueError('Script source must remain inside the project: ' + relative)
        parts.append(source.read_bytes())
    return b'\n;\n'.join(parts)
