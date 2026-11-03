/** Dedicated server connection. Implement with a private, TLS-verified driver pool. */
export interface SqlConnection {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(error?: Error): void;
}
export interface SqlPool {
  connect(): Promise<SqlConnection>;
}
