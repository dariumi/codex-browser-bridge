"""Build the Python wheel with the exact local npm runtime, never a registry lookup."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from setuptools import setup
from setuptools.command.build_py import build_py

class BuildBridge(build_py):
    def run(self):
        super().run()
        root = Path(__file__).resolve().parent
        node = shutil.which("node")
        if not node:
            raise RuntimeError("Building from source requires Node.js >=22 and npm; install the wheel instead")
        with tempfile.TemporaryDirectory(prefix="bridge-python-build-") as output:
            result = subprocess.run([node, str(root / "scripts/build-npm.js"), output], check=True, capture_output=True, text=True)
            archive = Path(result.stdout.strip().splitlines()[-1])
            destination = Path(self.build_lib) / "codex_browser_bridge/_bundle"
            destination.mkdir(parents=True, exist_ok=True)
            shutil.copy2(archive, destination / "runtime.tgz")
            metadata = {"version": json.loads((root / "package.json").read_text())["version"], "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
            (destination / "runtime.json").write_text(json.dumps(metadata) + "\n")

setup(cmdclass={"build_py": BuildBridge})
