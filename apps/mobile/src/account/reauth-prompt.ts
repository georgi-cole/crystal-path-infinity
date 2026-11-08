type Purpose = 'export' | 'delete';
export interface ReauthPromptState {
  readonly id: number;
  readonly purpose: Purpose;
  readonly invalid: boolean;
}
/** The code lives only in the form. Navigating away or changing accounts rejects the waiting operation. */
export class ReauthPrompt {
  private value: ReauthPromptState | null = null;
  private pending: { resolve: (code: string) => void; reject: (error: Error) => void } | null =
    null;
  private listeners = new Set<() => void>();
  private sequence = 0;
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A view cannot consume the verification result. */
      }
    }
  }
  request(purpose: Purpose, invalid = false): Promise<string> {
    this.cancel();
    this.value = { purpose, invalid, id: ++this.sequence };
    const promise = new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
    this.emit();
    return promise;
  }
  submit(code: string) {
    if (!/^\d{6}$/.test(code) || !this.pending) return;
    const pending = this.pending;
    this.pending = null;
    this.value = null;
    this.emit();
    pending.resolve(code);
  }
  cancel = () => {
    const pending = this.pending;
    this.pending = null;
    this.value = null;
    if (pending) pending.reject(new Error('Verification cancelled'));
    this.emit();
  };
}
