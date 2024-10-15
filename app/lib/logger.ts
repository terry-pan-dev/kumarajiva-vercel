export interface LogInfoMethod {
  /**
   * Logs info message (non-critical only).
   *
   * You can omit the message parameter, but please provide it.
   *
   * @param functionName - Name of function
   * @param message - Contextual message about what is happening (e.g. "Creating user")
   * @param data - Any additional data to be logged (optional)
   *
   * @example
   * ```ts
   * Logger.log('getUser', 'Getting user', { userId: '123' });
   * ```
   */
  (functionName: string, message: string, data?: Record<string, unknown> | unknown): void;
  (functionName: string, data: Record<string, unknown> | unknown): void;
}

export interface LogErrorMethod {
  /**
   * Logs error messages.
   *
   * You can omit the message parameter, but please provide it.
   *
   * @param functionName - Name of function
   * @param message - Contextual message about what is happening (e.g. "Error creating user")
   * @param data - Any additional data to be logged (optional)
   *
   * @example
   * ```ts
   * Logger.error('getUser', 'Error getting user', ex);
   * ```
   */
  (functionName: string, message: string, data?: Record<string, unknown> | unknown): void;
  (functionName: string, data: Record<string, unknown> | unknown): void;
}

export interface CustomLogger {
  log: LogInfoMethod;
  info: LogInfoMethod;
  error: LogErrorMethod;
  warn: LogErrorMethod;
}

const init = (): CustomLogger => {
  // Console is probably best logger
  // https://github1s.com/serverless/serverless/blob/HEAD/lib/plugins/aws/custom-resources/resources/utils.js
  const logger = console;

  return {
    log: (...args) => {
      logger.log(...args);
    },
    info: (...args) => {
      logger.info(...args);
    },
    error: (...args) => {
      logger.error(...args);
    },
    warn: (...args) => {
      logger.warn(...args);
    },
  };
};

export const logger = init();
