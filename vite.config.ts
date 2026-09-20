import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import monkey from 'vite-plugin-monkey';

const requiredEnv = (env: Record<string, string>, key: string) => {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`缺少必需的环境变量 ${key}`);
  }
  return value;
};

const validateUrl = (value: string, key: string, mode: string) => {
  const url = new URL(value);
  if (mode === 'prod' && url.protocol !== 'https:') {
    throw new Error(`${key} 在 prod 模式下必须使用 HTTPS`);
  }
  return value;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_USERSCRIPT_');
  const name = requiredEnv(env, 'VITE_USERSCRIPT_NAME');
  const namespace = validateUrl(
    requiredEnv(env, 'VITE_USERSCRIPT_NAMESPACE'),
    'VITE_USERSCRIPT_NAMESPACE',
    mode,
  );
  const downloadURL = validateUrl(
    requiredEnv(env, 'VITE_USERSCRIPT_DOWNLOAD_URL'),
    'VITE_USERSCRIPT_DOWNLOAD_URL',
    mode,
  );
  const updateURL = validateUrl(
    requiredEnv(env, 'VITE_USERSCRIPT_UPDATE_URL'),
    'VITE_USERSCRIPT_UPDATE_URL',
    mode,
  );
  const fileName = requiredEnv(env, 'VITE_USERSCRIPT_FILE_NAME');

  if (!fileName.endsWith('.user.js') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('VITE_USERSCRIPT_FILE_NAME 必须是当前目录下的 .user.js 文件名');
  }

  return {
    plugins: [
      react(),
      monkey({
        entry: 'src/main.tsx',
        userscript: {
          name,
          namespace,
          downloadURL,
          updateURL,
          description: '提取 B站视频字幕并生成 AI 总结，支持多 P、持续对话、评论弹幕分析、配图与 Flow 联动。',
          author: 'abining',
          icon: 'https://www.bilibili.com/favicon.ico',
          match: [
            'https://www.bilibili.com/video/*',
            'https://www.bilibili.com/list/*',
            'https://labs.google/fx/*/tools/flow/project*',
          ],
          grant: [
            'GM_setValue',
            'GM_getValue',
            'GM_addValueChangeListener',
            'GM_openInTab',
            'GM_xmlhttpRequest',
            'unsafeWindow',
          ],
          connect: ['*'],
          'run-at': 'document-start',
          license: 'MIT',
        },
        server: {
          open: false,
        },
        build: {
          fileName,
          metaFileName: false,
          autoGrant: false,
        },
      }),
    ],
    build: {
      // 保持用户脚本可审阅，禁止压缩或变量混淆。
      minify: false,
      cssMinify: false,
      sourcemap: false,
    },
  };
});
