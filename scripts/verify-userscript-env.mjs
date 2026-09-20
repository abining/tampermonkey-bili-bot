import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const mode = process.argv[2];
if (!['development', 'prod'].includes(mode)) {
  throw new Error('用法: node scripts/verify-userscript-env.mjs <development|prod>');
}

const env = loadEnv(mode, process.cwd(), 'VITE_USERSCRIPT_');
const required = (key) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`缺少必需的环境变量 ${key}`);
  return value;
};

const fileName = required('VITE_USERSCRIPT_FILE_NAME');
const artifactPath = resolve('dist', fileName);
const artifact = await readFile(artifactPath, 'utf8');
const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));

const expectedMetadata = new Map([
  ['name', required('VITE_USERSCRIPT_NAME')],
  ['namespace', required('VITE_USERSCRIPT_NAMESPACE')],
  ['version', packageJson.version],
  ['downloadURL', required('VITE_USERSCRIPT_DOWNLOAD_URL')],
  ['updateURL', required('VITE_USERSCRIPT_UPDATE_URL')],
]);

if (!artifact.includes('// ==UserScript==') || !artifact.includes('// ==/UserScript==')) {
  throw new Error(`${artifactPath} 缺少有效的 UserScript metadata block`);
}

for (const [key, expectedValue] of expectedMetadata) {
  const metadataPattern = new RegExp(`^// @${key}\\s+(.+)$`, 'm');
  const actualValue = artifact.match(metadataPattern)?.[1]?.trim();
  if (actualValue !== expectedValue) {
    throw new Error(`@${key} 不匹配：期望 ${expectedValue}，实际 ${actualValue ?? '<缺失>'}`);
  }
}

if (mode === 'prod') {
  for (const key of ['VITE_USERSCRIPT_NAMESPACE', 'VITE_USERSCRIPT_DOWNLOAD_URL', 'VITE_USERSCRIPT_UPDATE_URL']) {
    if (new URL(required(key)).protocol !== 'https:') {
      throw new Error(`${key} 在 prod 模式下必须使用 HTTPS`);
    }
  }
}

console.log(`已验证 ${mode} 构建：${artifactPath}`);
