// logger no padrão do pino: logger.warn({ campos }, "mensagem"), child() e níveis. A saída é uma linha
// JSON por registro (os logs da Vercel indexam os campos). Para trocar pelo pino, basta outra
// implementação de Logger

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

export type LogBindings = Record<string, unknown>;

export abstract class Logger {
  constructor(protected readonly bindings: LogBindings = {}) {}

  protected abstract write(level: LogLevel, fields: LogBindings, message: string): void;

  abstract child(bindings: LogBindings): Logger;

  debug(fieldsOrMessage: LogBindings | string, message?: string): void {
    this.log(LogLevel.Debug, fieldsOrMessage, message);
  }

  info(fieldsOrMessage: LogBindings | string, message?: string): void {
    this.log(LogLevel.Info, fieldsOrMessage, message);
  }

  warn(fieldsOrMessage: LogBindings | string, message?: string): void {
    this.log(LogLevel.Warn, fieldsOrMessage, message);
  }

  error(fieldsOrMessage: LogBindings | string, message?: string): void {
    this.log(LogLevel.Error, fieldsOrMessage, message);
  }

  private log(level: LogLevel, fieldsOrMessage: LogBindings | string, message?: string): void {
    if (typeof fieldsOrMessage === "string") {
      this.write(level, this.bindings, fieldsOrMessage);
      return;
    }

    this.write(level, { ...this.bindings, ...fieldsOrMessage }, message ?? "");
  }
}

// err: Error vira objeto (o JSON.stringify de um Error é {}); key e source vêm junto (InfraError, AppError)
function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  return { ...error, name: error.name, message: error.message, stack: error.stack };
}

class ConsoleLogger extends Logger {
  protected write(level: LogLevel, fields: LogBindings, message: string): void {
    const { err, ...rest } = fields;
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      ...rest,
      ...(err === undefined ? {} : { err: serializeError(err) }),
      msg: message,
    });

    console[level](line);
  }

  child(bindings: LogBindings): Logger {
    return new ConsoleLogger({ ...this.bindings, ...bindings });
  }
}

// um logger por arquivo: createLogger("GetEventUsecase")
export function createLogger(scope: string): Logger {
  return new ConsoleLogger({ scope });
}
