interface Disposable {
  dispose(): void;
}

interface Message {
  portablerpc: 'v1';
}

interface Transports {
  sendMessage<T extends Message>(message: T): void;
  onMessage(handler: (message: Message) => void): Disposable;
}

/**
 * Anything with this type can be serialized using `JSON.stringify`.
 * To make this type work properly, add `strictNullChecks` to your `tsconfig.json`.
 */
type ValidJson =
  | string
  | number
  | boolean
  | null
  | ValidJson[]
  | { [key: string]: ValidJson };

interface Connection extends Disposable {
  sendRequest<T extends ValidJson>(
    method: string,
    params: ValidJson
  ): Promise<T>;
  /**
   * Handles a request. If the handler returns a promise, the response will be sent when the promise is resolved.
   */
  onRequest<T>(
    method: string,
    handler: (params: T) => ValidJson | Promise<ValidJson>
  ): Disposable;

  sendNotification(method: string, params?: ValidJson): void;
  onNotification(
    method: string,
    handler: (params: ValidJson) => void
  ): Disposable;
}

interface RequestMessage extends Message {
  id: number;
  method: string;
  params: ValidJson;
}

interface ResponseMessage extends Message {
  id: number;
  result: ValidJson;
}

interface ErrorMessage extends Message {
  id: number;
  error: ValidJson;
}

function createRequestQueue(transports: Transports) {
  const queue = new Map<
    number,
    [(result: ValidJson) => void, (error: ValidJson) => void]
  >();
  let currentId = 0;
  let disposed = false;

  const listener = transports.onMessage((message) => {
    if (disposed || message.portablerpc !== 'v1' || !('id' in message)) return;

    if ('error' in message) {
      const { id, error } = message as ErrorMessage;
      const [, reject] = queue.get(id)!;
      reject(error);
      queue.delete(id);
      return;
    }

    if ('result' in message) {
      const { id, result } = message as ResponseMessage;
      const [resolve] = queue.get(id)!;
      resolve(result);
      queue.delete(id);
      return;
    }
  });

  return {
    sendRequest<T extends ValidJson>(
      method: string,
      params: ValidJson
    ): Promise<T> {
      if (disposed) {
        throw new Error('Connection is disposed');
      }
      return new Promise<T>((resolve, reject) => {
        const id = ++currentId;
        queue.set(id, [resolve as any, reject]);
        transports.sendMessage({
          portablerpc: 'v1',
          id,
          method,
          params,
        });
      });
    },

    dispose() {
      disposed = true;
      listener.dispose();
      queue.clear();
    },
  };
}

function createConnection(transports: Transports): Connection {
  const requestQueue = createRequestQueue(transports);
  const handlers = new Map<string, Function[]>();
  const disposables: Disposable[] = [];

  disposables.push(
    transports.onMessage((message: RequestMessage) => {
      if (message.portablerpc !== 'v1' || !('method' in message)) return;
      const list = handlers.get(message.method);
      if (!list) return;

      if (!message.id) {
        for (let i = 0; i < list.length; i++) {
          list[i](message.params);
        }
      } else {
        (async () => {
          try {
            const result = await list[0](message.params);
            transports.sendMessage({
              portablerpc: 'v1',
              id: message.id,
              result,
            });
          } catch (error) {
            transports.sendMessage({
              portablerpc: 'v1',
              id: message.id,
              error,
            });
          }
        })();
      }
    })
  );

  return {
    sendRequest<T extends ValidJson>(
      method: string,
      params: ValidJson
    ): Promise<T> {
      return requestQueue.sendRequest<T>(method, params);
    },

    onRequest(method, handler) {
      if (!handlers.has(method)) {
        handlers.set(method, []);
      }
      const list = handlers.get(method)!;
      list.push(handler);
      return {
        dispose() {
          const index = list.indexOf(handler);
          if (index !== -1) {
            list.splice(index, 1);
          }
        },
      };
    },

    sendNotification(method, params) {
      transports.sendMessage({
        portablerpc: 'v1',
        method,
        params,
      });
    },

    onNotification(method, handler) {
      return transports.onMessage((message: RequestMessage) => {
        if (message.portablerpc !== 'v1' || message.method !== method) return;
        handler(message.params);
      });
    },

    dispose() {
      requestQueue.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}

abstract class BaseTransports implements Transports {
  abstract sendMessage<T extends Message>(message: T): void;
  private _handlers: ((message: Message) => void)[] = [];

  /**
   * Fires a message to all registered handlers. Messages are validated, but non-messages will result in console warns, so *please* validate the messages yourself.
   */
  protected fireMessage(message: Message) {
    if (
      typeof message !== 'object' ||
      message === null ||
      message.portablerpc !== 'v1'
    )
      return;
    for (let i = 0; i < this._handlers.length; i++) {
      this._handlers[i](message);
    }
  }

  onMessage(handler: (message: Message) => void): Disposable {
    this._handlers.push(handler);

    return {
      dispose() {
        const index = this._handlers.indexOf(handler);
        if (index !== -1) {
          this._handlers.splice(index, 1);
        }
      },
    };
  }
}

export { createConnection, BaseTransports };
export type {
  Disposable,
  ValidJson,
  Message as TinyRpcMessage,
  RequestMessage as TinyRpcRequest,
  ResponseMessage as TinyRpcResult,
  ErrorMessage as TinyRpcError,
  Transports,
  Connection as TinyRpcConnection,
};
