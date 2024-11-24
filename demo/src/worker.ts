import { createConnection, BaseTransports, TinyRpcMessage } from 'tinyrpc';

class SelfTransports extends BaseTransports {
  sendMessage<T extends TinyRpcMessage>(message: T): void {
    self.postMessage(message);
  }

  constructor() {
    super();
    self.addEventListener('message', (e) => {
      this.fireMessage(e.data);
    });
  }
}

setTimeout(() => {
  const connection = createConnection(new SelfTransports());

  connection.onRequest('add', async (params: [string, string]) => {
    const [a, b] = params.map((val) => parseInt(val));
    if (isNaN(a) || isNaN(b)) {
      throw new Error('Custom worker error: The parameters must be numbers!');
    }
    return { value: a + b };
  });

  connection.sendNotification('ready');
}, 2000);
