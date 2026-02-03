interface IdleDeadline {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

type IdleRequestCallback = (deadline: IdleDeadline) => void;

interface Window {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}
