import './style.css';
import { createConnection, BaseTransports, Message } from 'portablerpc';
import TestWorker from './worker?worker';

const worker = new TestWorker();

class WorkerTransports extends BaseTransports {
  constructor(private _worker: Worker) {
    super();

    this._worker.addEventListener('message', (e) => {
      this.fireMessage(e.data);
    });
  }
  sendMessage<T extends Message>(message: T): void {
    this._worker.postMessage(message);
  }
}

console.log('activating worker...');

const connection = createConnection(new WorkerTransports(worker));
connection.onNotification('ready', async () => {
  console.log('Worker is ready!');

  const addContainer = document.getElementById('add')!;
  const num1Input = addContainer.querySelector('.num1') as HTMLInputElement;
  const num2Input = addContainer.querySelector('.num2') as HTMLInputElement;
  const resultParagraph = addContainer.querySelector(
    '.result'
  ) as HTMLParagraphElement;
  const errorParagraph = addContainer.querySelector(
    '.error'
  ) as HTMLParagraphElement;
  const calculateButton = addContainer.querySelector('button')!;

  calculateButton.addEventListener('click', async () => {
    try {
      const result = await connection.sendRequest<{ value: number }>('add', [
        num1Input.value,
        num2Input.value,
      ]);
      resultParagraph.textContent = `Result: ${result.value}`;
      errorParagraph.style.display = 'none';
    } catch (error) {
      resultParagraph.textContent = 'Error calculating result';
      errorParagraph.textContent = (error as Error).message;
      errorParagraph.style.display = 'block';
    }
  });
});

console.log('stuff');
