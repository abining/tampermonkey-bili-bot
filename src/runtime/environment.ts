export function isFlowProjectPage(): boolean {
  return location.hostname === 'labs.google'
    && /\/fx\/.*\/tools\/flow\/project\//.test(location.pathname);
}

export function isBilibiliPage(): boolean {
  return location.hostname === 'www.bilibili.com'
    && (/^\/video\//.test(location.pathname) || /^\/list\//.test(location.pathname));
}
