/// <reference lib="dom" />

import { BaseTransports, Message } from '../index';

/**
 * Anything
 */
interface PostMessageCompatible {
  postMessage(message: any): any;
  addEventListener(event: string, handler: (ev: Event) => any): any;
  removeEventListener(event: string, handler: (ev: Event) => any): any;
}

export class PostMessageTransports extends BaseTransports {
  constructor(private transporter: PostMessageCompatible) {
    super();

    transporter.addEventListener('message', this.handleMessage);
  }

  private handleMessage = (e: Event) => this.fireMessage((e as MessageEvent).data);

  sendMessage<T extends Message>(message: T): void {
    this.transporter.postMessage(message);
  }

  public dispose = () => this.transporter.removeEventListener('message', this.handleMessage);
}
