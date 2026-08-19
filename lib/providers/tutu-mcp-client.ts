const MCP_PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_TIMEOUT_MS = 12_000;

export const TUTU_MCP_URL = "https://mcp.tutu.ru/mcp";

type JsonRpcError = {
  code: number;
  message: string;
};

type JsonRpcResponse<T> = {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: JsonRpcError;
};

type ToolCallResult = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  isError?: boolean;
};

export class TutuMcpError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "TutuMcpError";
  }
}

export class TutuMcpClient {
  private nextRequestId = 1;
  private initialized?: Promise<void>;

  constructor(
    private readonly endpoint = TUTU_MCP_URL,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureInitialized();

    const result = await this.request<ToolCallResult>("tools/call", {
      name,
      arguments: args,
    });

    if (result.isError) {
      throw new TutuMcpError(
        `Tutu MCP не смог выполнить ${name}: ${toolMessage(result)}`,
      );
    }

    const text = result.content?.find(
      (content) => content.type === "text" && typeof content.text === "string",
    )?.text;

    if (!text) {
      throw new TutuMcpError(`Tutu MCP вернул пустой ответ для ${name}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new TutuMcpError(
        `Tutu MCP вернул некорректные данные для ${name}`,
        cause,
      );
    }
  }

  private ensureInitialized() {
    this.initialized ??= this.initialize();
    return this.initialized;
  }

  private async initialize() {
    await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "make-it-in-time",
        version: "0.1.0",
      },
    });
    await this.notify("notifications/initialized");
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextRequestId++,
          method,
          params,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TutuMcpError(
          `Tutu MCP недоступен: HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as JsonRpcResponse<T>;

      if (payload.error) {
        throw new TutuMcpError(
          `Tutu MCP вернул ошибку ${payload.error.code}: ${payload.error.message}`,
        );
      }

      if (!payload.result) {
        throw new TutuMcpError("Tutu MCP не вернул результат");
      }

      return payload.result;
    } catch (cause) {
      if (cause instanceof TutuMcpError) throw cause;

      const message =
        cause instanceof Error && cause.name === "AbortError"
          ? "Превышено время ожидания ответа Tutu MCP"
          : "Не удалось подключиться к Tutu MCP";
      throw new TutuMcpError(message, cause);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async notify(method: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params: {},
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TutuMcpError(
          `Tutu MCP не принял ${method}: HTTP ${response.status}`,
        );
      }
    } catch (cause) {
      if (cause instanceof TutuMcpError) throw cause;
      throw new TutuMcpError("Не удалось завершить подключение к Tutu MCP", cause);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toolMessage(result: ToolCallResult) {
  return (
    result.content?.find(
      (content) => content.type === "text" && typeof content.text === "string",
    )?.text ?? "без описания"
  );
}
