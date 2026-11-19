#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);

const isDev = args.includes('--dev');
const profile = isDev ? 'debug' : 'release';

console.log(`[build-wasm] Building neon_street_wasm (${profile} profile)...`);

const cargoArgs = ['build', '--target', 'wasm32-unknown-unknown'];
if (!isDev) {
  cargoArgs.push('--release');
}

const cargoRun = spawnSync('cargo', cargoArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (cargoRun.error) {
  console.error(`[build-wasm] Failed to execute cargo: ${cargoRun.error.message}`);
  process.exit(1);
}

if (cargoRun.status !== 0) {
  console.error(`[build-wasm] Cargo build failed with exit code ${cargoRun.status}`);
  process.exit(cargoRun.status ?? 1);
}

const wasmInputPath = resolve(
  rootDir,
  'target',
  'wasm32-unknown-unknown',
  profile,
  'neon_street_wasm.wasm'
);

if (!existsSync(wasmInputPath)) {
  console.error(`[build-wasm] Compiled wasm not found at: ${wasmInputPath}`);
  process.exit(1);
}

const outDir = resolve(rootDir, 'web', 'wasm', 'pkg');
mkdirSync(outDir, { recursive: true });

console.log(`[build-wasm] Running wasm-bindgen for ${wasmInputPath}...`);

const bindgenArgs = [
  '--target',
  'web',
  '--out-dir',
  outDir,
  '--out-name',
  'neon_street_wasm',
  wasmInputPath,
];

const bindgenRun = spawnSync('wasm-bindgen', bindgenArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (bindgenRun.error) {
  console.error(`[build-wasm] Failed to execute wasm-bindgen: ${bindgenRun.error.message}`);
  process.exit(1);
}

if (bindgenRun.status !== 0) {
  console.error(`[build-wasm] wasm-bindgen failed with exit code ${bindgenRun.status}`);
  process.exit(bindgenRun.status ?? 1);
}

const bgWasm = resolve(outDir, 'neon_street_wasm_bg.wasm');
const directWasm = resolve(outDir, 'neon_street_wasm.wasm');
const generatedWasm = existsSync(bgWasm) ? bgWasm : existsSync(directWasm) ? directWasm : null;

if (!generatedWasm) {
  console.error(`[build-wasm] Generated wasm file not found in ${outDir}`);
  process.exit(1);
}

const stat = statSync(generatedWasm);
const sizeKb = (stat.size / 1024).toFixed(2);
console.log(`[build-wasm] Generated WASM size: ${sizeKb} KB (${stat.size} bytes)`);
