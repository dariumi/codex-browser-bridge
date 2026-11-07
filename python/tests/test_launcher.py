import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from codex_browser_bridge import __version__
from codex_browser_bridge import cli

class LauncherTests(unittest.TestCase):
    def bundle(self, root, content=b'fixture archive', checksum=None):
        bundle = root / '_bundle'; bundle.mkdir()
        (bundle / 'runtime.tgz').write_bytes(content)
        (bundle / 'runtime.json').write_text(json.dumps({'version': __version__, 'sha256': checksum or hashlib.sha256(content).hexdigest()}))

    def test_version_and_help_work_without_node_or_bootstrap(self):
        with patch.object(cli, 'prerequisites', side_effect=AssertionError('should not run')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cli.main(['--version']), 0)
            self.assertIn(__version__, output.getvalue())
            self.assertEqual(cli.main(['--help']), 0)
            self.assertIn('Node.js', output.getvalue())

    def test_bundle_digest_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root, checksum='0' * 64)
            with patch.object(cli, 'files', return_value=root):
                with self.assertRaisesRegex(RuntimeError, 'integrity'):
                    cli.runtime_payload()

    def test_missing_cache_requires_explicit_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root)
            with patch.object(cli, 'files', return_value=root), patch.object(cli, 'cache_directory', return_value=root / 'cache'):
                with self.assertRaisesRegex(RuntimeError, 'bootstrap'):
                    cli.ensure_runtime(False)
                self.assertFalse((root / 'cache').exists())

    def test_cache_is_version_and_digest_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root)
            digest = hashlib.sha256(b'fixture archive').hexdigest()[:16]
            entry = root / 'cache' / (__version__ + '-' + digest) / 'node_modules/codex-browser-bridge/bin/codex-browser-bridge.js'
            entry.parent.mkdir(parents=True); entry.write_text('// fixture')
            with patch.object(cli, 'files', return_value=root), patch.object(cli, 'cache_directory', return_value=root / 'cache'), patch.object(cli, 'prerequisites', side_effect=AssertionError('should not install')):
                self.assertEqual(cli.ensure_runtime(False), entry)

    def test_successful_bootstrap_is_atomic_and_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root)
            def install(command, **kwargs):
                stage = Path(command[command.index('--prefix') + 1])
                entry = stage / 'node_modules/codex-browser-bridge/bin/codex-browser-bridge.js'
                entry.parent.mkdir(parents=True); entry.write_text('// installed fixture')
            with patch.object(cli, 'files', return_value=root), patch.object(cli, 'cache_directory', return_value=root / 'cache'), patch.object(cli, 'prerequisites', return_value=('/node','/npm')), patch.object(cli.subprocess, 'run', side_effect=install) as run:
                entry = cli.ensure_runtime(True)
                self.assertTrue(entry.is_file())
                self.assertEqual(cli.ensure_runtime(False), entry)
                self.assertEqual(run.call_count, 1)
                self.assertFalse(list((root / 'cache').glob('.bridge-stage-*')))

    def test_old_node_is_rejected(self):
        with patch.object(cli.shutil, 'which', return_value='/fixture/bin'), patch.object(cli.subprocess, 'run') as run:
            run.return_value.stdout = 'v20.0.0'
            with self.assertRaisesRegex(RuntimeError, '>=22'):
                cli.prerequisites()

    def test_failed_install_leaves_no_runtime_or_stage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.bundle(root)
            with patch.object(cli, 'files', return_value=root), patch.object(cli, 'cache_directory', return_value=root / 'cache'), patch.object(cli, 'prerequisites', return_value=('/node','/npm')), patch.object(cli.subprocess, 'run', side_effect=cli.subprocess.CalledProcessError(1, 'npm')):
                with self.assertRaises(cli.subprocess.CalledProcessError):
                    cli.ensure_runtime(True)
                self.assertEqual(list((root / 'cache').iterdir()), [])

if __name__ == '__main__':
    unittest.main()
