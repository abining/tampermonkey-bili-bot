import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'bilibili-视频总结 Beta',
        namespace: 'https://github.com/abining/tampermonkey-bili-bot',
        version: '0.1.0-beta.1',
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
        fileName: 'bilibili-video-summary-beta.user.js',
        metaFileName: false,
        autoGrant: false,
      },
    }),
  ],
  build: {
    minify: 'oxc',
    sourcemap: false,
  },
});
