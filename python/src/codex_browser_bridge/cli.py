"""No Git or global npm package required. Node.js >=22 and npm are prerequisites."""
import hashlib
from importlib.resources import files
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from . import __version__


def cache_directory():
    if os.environ.get("BROWSER_BRIDGE_PY_CACHE"):
        return Path(os.environ["BROWSER_BRIDGE_PY_CACHE"]).expanduser()
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home()))
    elif sys.platform == "darwin":
        base = Path.home() / "Library/Caches"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return base / "codex-browser-bridge"


def runtime_payload():
    bundle = files("codex_browser_bridge").joinpath("_bundle")
    metadata = json.loads(bundle.joinpath("runtime.json").read_text())
    archive = bundle.joinpath("runtime.tgz").read_bytes()
    if metadata["version"] != __version__ or hashlib.sha256(archive).hexdigest() != metadata["sha256"]:
        raise RuntimeError("Bundled runtime integrity/version mismatch")
    return archive, metadata


def prerequisites():
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        raise RuntimeError("Install Node.js >=22 and npm; this Python package launches the Node.js bridge")
    result = subprocess.run([node, "--version"], capture_output=True, text=True, check=True)
    if int(result.stdout.strip().lstrip("v").split(".")[0]) < 22:
        raise RuntimeError("Node.js >=22 is required")
    return node, npm


def ensure_runtime(install=False):
    archive, metadata = runtime_payload()
    destination = cache_directory() / (__version__ + "-" + metadata["sha256"][:16])
    entry = destination / "node_modules/codex-browser-bridge/bin/codex-browser-bridge.js"
    if entry.is_file():
        return entry
    if not install:
        raise RuntimeError("Run codex-browser-bridge bootstrap (or setup) once to install runtime dependencies")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        destination.parent.chmod(0o700)
    node, npm = prerequisites()
    with tempfile.TemporaryDirectory(prefix=".bridge-stage-", dir=destination.parent) as temporary:
        stage = Path(temporary)
        payload = stage / "runtime.tgz"
        payload.write_bytes(archive)
        (stage / "package.json").write_text('{"private":true}\n')
        npm_command = [npm]
        if os.name == "nt":
            npm_cli = Path(npm).parent / "node_modules/npm/bin/npm-cli.js"
            if not npm_cli.is_file():
                raise RuntimeError("Cannot locate npm-cli.js next to npm; use a standard Node.js installation")
            npm_command = [node, str(npm_cli)]
        command = [*npm_command, "install", "--prefix", str(stage), "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", str(payload)]
        # Dependency installation is explicit and logs go to stderr, never MCP stdout.
        subprocess.run(command, check=True, stdout=sys.stderr, stderr=sys.stderr)
        payload.unlink()
        if not (stage / "node_modules/codex-browser-bridge/bin/codex-browser-bridge.js").is_file():
            raise RuntimeError("npm did not install the bundled bridge")
        try:
            stage.rename(destination)
        except OSError:
            if not entry.is_file():
                raise
    return entry


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] in ("--version", "-v", "version"):
        print(__version__)
        return 0
    if args and args[0] in ("--help", "-h", "help"):
        print("Codex Browser Bridge (Python launcher)\nRequires Node.js >=22 and npm.\nCommands: setup, bootstrap, mcp (default), extension, doctor, status, stop, restart, bridge, fixture, native-setup\nsetup bootstraps the bundled runtime and registers Codex. bootstrap only installs dependencies.\nOther arguments pass through to the Node CLI. Run setup before using MCP.")
        return 0
    try:
        node, _ = prerequisites()
        entry = ensure_runtime(install=bool(args and args[0] in ("setup", "bootstrap")))
        if args and args[0] == "bootstrap":
            print("Bundled bridge runtime is ready", file=sys.stderr)
            return 0
        if os.name == "nt":
            return subprocess.call([node, str(entry), *args])
        os.execv(node, [node, str(entry), *args])
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"codex-browser-bridge: {error}", file=sys.stderr)
        return 1
