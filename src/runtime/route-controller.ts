export interface RouteControllerOptions {
  getRouteKey: () => string;
  onRouteChange: (routeKey: string) => void;
  delayMs?: number;
  pollIntervalMs?: number;
}

export class RouteController {
  private lastRouteKey = '';
  private restartTimer: number | null = null;
  private installed = false;
  private readonly delayMs: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly options: RouteControllerOptions) {
    this.delayMs = options.delayMs ?? 800;
    this.pollIntervalMs = options.pollIntervalMs ?? 400;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.lastRouteKey = this.options.getRouteKey();

    const schedule = () => window.setTimeout(() => this.scheduleRestart(), 120);
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        schedule();
        return result;
      } as History[typeof method];
    }
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('urlchange', schedule);
    window.setInterval(() => this.scheduleRestart(), this.pollIntervalMs);
  }

  private scheduleRestart(): void {
    const routeKey = this.options.getRouteKey();
    if (!routeKey || routeKey === this.lastRouteKey) return;
    this.lastRouteKey = routeKey;

    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      this.options.onRouteChange(routeKey);
    }, this.delayMs);
  }
}
