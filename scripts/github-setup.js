import { spawnSync } from 'node:child_process';
const topics = ['mcp', 'codex', 'browser-automation', 'firefox', 'chromium', 'brave', 'browser-extension', 'model-context-protocol', 'ai-agent', 'webextension'];
const result = spawnSync('gh', ['repo', 'edit', 'dariumi/codex-browser-bridge', '--description', 'Codex browser automation over MCP: Chromium, Brave and Firefox extension with scoped approvals, private chat, virtual media and remote browser control', '--homepage', 'https://github.com/dariumi/codex-browser-bridge#installation', ...topics.flatMap(topic => ['--add-topic', topic])], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
