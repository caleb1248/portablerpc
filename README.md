# Tinyrpc

A small json-based rpc for javascript.

# Example Usage

```typescript
import {
  createConnection,
  BaseTransports,
  Connection,
  Message,
} from 'portablerpc';

class CustomTransports extends BaseTransports {
  constructor() {
    super();
    window.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received message:', message);
      this.onMessage(message);
    };
  }
  sendMessage<T extends Message>(message: T): void {
    console.log('Sending message:', message);
  }
}

// Create a connection using the custom transport
const transports = new CustomTransports();
const connection: Connection = createConnection(transports);

// Example of sending a request
connection.sendRequest('exampleMethod', { key: 'value' }).then((response) => {
  console.log('Received response:', response);
});

// Example of handling a request
connection.onRequest('exampleMethod', async (params) => {
  console.log('Received request with params:', params);
  return { result: 'success' };
});

// Example of sending a notification
connection.sendNotification('exampleNotification', { key: 'value' });

// Example of handling a notification
connection.onNotification('exampleNotification', (params) => {
  console.log('Received notification with params:', params);
});
```

# Demo (for testing purposes)

See https://github.com/caleb1248/tinyrpc/tree/main/demo
