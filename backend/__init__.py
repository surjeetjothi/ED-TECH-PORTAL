import sys
from pathlib import Path

# Ensure absolute imports like "app.core.*" resolve when loading as a package.
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from .backend import app

__all__ = ["app"]
