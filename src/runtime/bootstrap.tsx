import { createRoot } from 'react-dom/client';
import style from '../ui/styles/index.css?style';
import mainPanelStyle from '../ui/main/main.css?style';
import { FlowRuntime } from '../flow/flow-runtime';
import { App } from '../ui/App';
import { appController } from './app-controller';
import { bilibiliApplication } from './application';
import { isBilibiliPage, isFlowProjectPage } from './environment';

const APP_HOST_ID = 'bilibili-video-summary-app';
const APP_SINGLETON_KEY = '__BILIBILI_VIDEO_SUMMARY_BETA__';

type UserscriptWindow = Window & typeof globalThis & {
  [APP_SINGLETON_KEY]?: boolean;
};

function waitForBody(): Promise<HTMLBodyElement> {
  if (document.body) return Promise.resolve(document.body);
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(document.body), { once: true });
  });
}

async function mountBilibiliApp(): Promise<void> {
  const body = await waitForBody();
  const existing = document.getElementById(APP_HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = APP_HOST_ID;
  const shadowRoot = host.attachShadow({ mode: 'open' });
  shadowRoot.append(style);
  shadowRoot.append(mainPanelStyle);

  const mountPoint = document.createElement('div');
  mountPoint.id = 'bilibili-video-summary-react-root';
  shadowRoot.appendChild(mountPoint);
  const stopEditableKeyboardEvent = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target.isContentEditable
    ) {
      event.stopPropagation();
    }
  };
  shadowRoot.addEventListener('keydown', stopEditableKeyboardEvent);
  shadowRoot.addEventListener('keypress', stopEditableKeyboardEvent);
  shadowRoot.addEventListener('keyup', stopEditableKeyboardEvent);
  body.appendChild(host);

  createRoot(mountPoint).render(<App controller={appController} />);
}

export async function bootstrapUserscript(): Promise<void> {
  const userscriptWindow = window as UserscriptWindow;
  if (userscriptWindow[APP_SINGLETON_KEY]) return;
  userscriptWindow[APP_SINGLETON_KEY] = true;

  if (isFlowProjectPage()) {
    await new FlowRuntime().start();
    return;
  }

  if (!isBilibiliPage()) return;
  bilibiliApplication.start();
  await mountBilibiliApp();
}
