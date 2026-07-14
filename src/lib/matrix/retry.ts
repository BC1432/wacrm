export function retryDelaySeconds(attempt: number): number {
  return Math.min(15 * 2 ** Math.max(0, attempt - 1), 3600);
}
