import * as brevo from '@getbrevo/brevo';
import { IAlertStrategy } from './alert-strategy.interface.js';
import { AlertPayload } from '../alert.types.js';
import { generateHtmlTemplate } from '../lib/utils.js';

export class EmailAlertStrategy implements IAlertStrategy {
    readonly channelName = 'email' as const;
    private apiInstance: brevo.TransactionalEmailsApi;
    private fromEmail: string;
    private fromName: string;

    constructor() {
        const apiKey = process.env.BREVO_API_KEY;
        if (!apiKey) {
            throw new Error('[EmailStrategy] Missing BREVO_API_KEY in environment variables.');
        }

        this.apiInstance = new brevo.TransactionalEmailsApi();
        this.apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);

        this.fromEmail = process.env.ALERT_FROM_EMAIL || 'swastidev27@gmail.com';
        this.fromName = process.env.ALERT_FROM_NAME || 'DeployHub Monitor';
    }

    async send(payload: AlertPayload): Promise<void> {
        const { recipient, title, message, metadata } = payload;
        const targetRecipient = process.env.ALERT_TEST_RECIPIENT || recipient;

        // 1. Generate clean HTML template for the alert
        const htmlBody = generateHtmlTemplate(title, message, metadata);

        // 2. Build email payload with Brevo SDK
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = `🚨 ${title}`;
        sendSmtpEmail.htmlContent = htmlBody;
        sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
        sendSmtpEmail.to = [{ email: targetRecipient }];

        // 3. Dispatch using Brevo Transactional Email SDK
        try {
            const data = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
            console.log(`[EmailStrategy] Email dispatched successfully via Brevo SDK! Message ID:`, (data as any)?.body?.messageId || (data as any)?.response?.statusCode || 'sent');
        } catch (error: any) {
            console.error(`[EmailStrategy] Brevo SDK Error:`, error.response?.body || error.message || error);
            throw new Error(`Failed to send email via Brevo: ${error.response?.body?.message || error.message || 'Unknown error'}`);
        }
    }
}