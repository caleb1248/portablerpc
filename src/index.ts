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
type ValidJson = string | number | boolean | null | ValidJson[] | ValidJsonObject;

interface ValidJsonObject extends Record<string, ValidJson> {}

interface Connection extends Disposable {
  sendRequest<T extends ValidJson>(method: string, params: ValidJson): Promise<T>;
  /**
   * Handles a request. If the handler returns a promise, the response will be sent when the promise is resolved.
   */
  onRequest<T>(method: string, handler: (params: T) => ValidJson | Promise<ValidJson>): Disposable;

  sendNotification(method: string, params?: ValidJson): void;
  onNotification(method: string, handler: (params: ValidJson) => void): Disposable;
}

interface RequestMessage extends Message {
  id: number;
  method: string;
  params: ValidJson;
}

interface NotificationMessage extends Message {
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
  const queue = new Map<number, [(result: ValidJson) => void, (error: ValidJson) => void]>();
  let currentId = 0;
  let disposed = false;

  const listener = transports.onMessage((message) => {
    if (disposed || message.portablerpc !== 'v1' || !('id' in message)) return;

    // Handle error messages
    if ('error' in message) {
      const { id, error } = message as ErrorMessage;
      if (!queue.has(id)) return;

      const [, reject] = queue.get(id)!;
      reject(error);
      queue.delete(id);
      return;
    }

    // Handle result messages
    if ('result' in message) {
      const { id, result } = message as ResponseMessage;
      if (!queue.has(id)) return;

      const [resolve] = queue.get(id)!;
      resolve(result);
      queue.delete(id);
      return;
    }
  });

  return {
    sendRequest<T extends ValidJson>(method: string, params: ValidJson): Promise<T> {
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

function isRequestMessage(message: Message): message is RequestMessage {
  return 'method' in message;
}

function createConnection(transports: Transports): Connection {
  const requestQueue = createRequestQueue(transports);
  const handlers = new Map<string, Function[]>();
  const disposables: Disposable[] = [];

  // Handle requests
  disposables.push(
    transports.onMessage((message: Message) => {
      if (message.portablerpc !== 'v1' || !isRequestMessage(message)) return;
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
    }),
  );

  return {
    sendRequest<T extends ValidJson>(method: string, params: ValidJson): Promise<T> {
      return requestQueue.sendRequest<T>(method, params);
    },

    onRequest(method, handler) {
      if (!handlers.has(method)) {
        handlers.set(method, []);
      }
      const list = handlers.get(method)!;
      list.push(handler);
      const disposable = {
        dispose() {
          const index = list.indexOf(handler);
          if (index !== -1) {
            list.splice(index, 1);
          }
        },
      };

      disposables.push(disposable);
      return disposable;
    },

    sendNotification(method, params) {
      transports.sendMessage({
        portablerpc: 'v1',
        method,
        params,
      });
    },

    onNotification(method, handler) {
      const disposable = transports.onMessage((message: Message) => {
        if (
          message.portablerpc !== 'v1' ||
          (message as NotificationMessage).method !== method ||
          (message as RequestMessage).id
        ) {
          return;
        }

        handler((message as NotificationMessage).params);
      });

      disposables.push(disposable);
      return disposable;
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
   * Fires a message to all registered handlers. Non-messages are ignored
   */
  protected fireMessage(message: Message) {
    if (!message || message.portablerpc !== 'v1') return;
    for (let i = 0; i < this._handlers.length; i++) {
      this._handlers[i](message);
    }
  }

  onMessage(handler: (message: Message) => void): Disposable {
    this._handlers.push(handler);

    return {
      dispose: () => {
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
  ValidJsonObject,
  Message,
  RequestMessage,
  ResponseMessage,
  ErrorMessage,
  Transports,
  Connection,
};
