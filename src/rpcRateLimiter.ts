type AsyncFn<T> = () => Promise<T>;

export class RpcRateLimiter {
  private queue: Array<() => void> = [];
  private running = false;
  private currentInterval: number;
  private last429: number = 0;
  private maxInterval: number;
  private baseInterval: number;
  private activeRequests: number = 0;
  private maxConcurrent: number;

  constructor(minIntervalMs: number, maxIntervalMs = 10000, maxConcurrent = 1) {
    this.currentInterval = minIntervalMs;
    this.baseInterval = minIntervalMs;
    this.maxInterval = maxIntervalMs;
    this.maxConcurrent = maxConcurrent;
  }

  public backoff() {
    this.last429 = Date.now();
    this.currentInterval = Math.min(this.currentInterval * 2, this.maxInterval);
    console.warn(
      `RateLimiter: 429 detected. Increasing interval to ${this.currentInterval}ms`
    );
  }

  public resetIfStable(stableMs = 60000) {
    if (this.currentInterval > this.baseInterval && Date.now() - this.last429 > stableMs) {
      this.currentInterval = this.baseInterval;
      console.info("RateLimiter: No 429s for a while. Interval reset to base:", this.baseInterval);
    }
  }

  schedule<T>(fn: AsyncFn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        if (this.activeRequests < this.maxConcurrent) {
          this.activeRequests++;
          fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              this.activeRequests--;
              setTimeout(() => this.next(), this.currentInterval);
            });
        } else {
          setTimeout(() => this.next(), this.currentInterval);
        }
      });
      if (!this.running) {
        this.running = true;
        this.next();
      }
    });
  }

  private next() {
    if (this.queue.length === 0) {
      this.running = false;
      return;
    }
    const task = this.queue.shift();
    if (task) task();
  }
}