// jsdom does not implement CanvasRenderingContext2D; stub `getContext` so the
// rendering code paths in main.ts can execute during tests without the heavy
// `canvas` native dependency.
const NOOP = () => {};
const stubContext = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (prop === 'canvas') {
        document.createElement('canvas');
        return null;
      }
      if (prop === 'measureText') {
        return () => ({ width: 0 });
      }
      return typeof prop === 'string' ? NOOP : undefined;
    },
  },
) as unknown;

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
): CanvasRenderingContext2D | null {
  return stubContext as CanvasRenderingContext2D;
} as HTMLCanvasElement['getContext'];

export {};
