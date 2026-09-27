import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SERVER_INFO } from '../src/mcp/protocol.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('doctor reports the package release version', () => {
  assert.equal(SERVER_INFO.version, packageJson.version);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsg-doctor-version-'));
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'doctor'], {
      encoding: 'utf8',
      env: { ...process.env, LSG_DB_PATH: path.join(temp, 'doctor.sqlite'), LSG_WORKSPACE_ROOT: temp }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).version, packageJson.version);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
