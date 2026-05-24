import { EventEmitter } from 'events';

declare global {
  // eslint-disable-next-line no-var
  var __dbEventEmitter: EventEmitter | undefined;
}

export const dbEventEmitter = global.__dbEventEmitter ?? new EventEmitter();
global.__dbEventEmitter = dbEventEmitter;
