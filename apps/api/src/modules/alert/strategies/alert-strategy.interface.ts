import { AlertPayload } from '../alert.types.js';

// The Strategy Interface: Every notification channel MUST implement this interface
export interface IAlertStrategy {
    readonly channelName: AlertPayload['channel'];
    send(payload: AlertPayload): Promise<void>;
}