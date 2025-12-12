/**
 * Standard interface for logging within the application.
 * Allows passing custom loggers (e.g., Winston, Pino) if needed.
 */
export interface Logger {
  /** Log detailed debug information useful for development */
  debug(message: string, ...args: any[]): void;
  /** Log general informational messages */
  info(message: string, ...args: any[]): void;
  /** Log warning messages for non-critical issues */
  warn(message: string, ...args: any[]): void;
  /** Log error messages for critical failures */
  error(message: string, ...args: any[]): void;
}

/**
 * Default logger implementation that outputs to the browser/Node.js console.
 * Prefixes messages with log levels for clarity.
 */
export class ConsoleLogger implements Logger {
  debug(message: string, ...args: any[]): void {
    console.debug(`[DEBUG] ${message}`, ...args);
  }
  info(message: string, ...args: any[]): void {
    console.info(`[INFO] ${message}`, ...args);
  }
  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }
  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
}
