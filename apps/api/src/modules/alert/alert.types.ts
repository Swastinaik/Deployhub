export type AlertChannel = 'email' | 'slack' | 'pagerduty';

export interface AlertPayload {
    channel: AlertChannel;
    recipient: string; // Email address, Slack webhook URL, or Channel ID
    title: string;
    message: string;
    metadata?: Record<string, any>;
}