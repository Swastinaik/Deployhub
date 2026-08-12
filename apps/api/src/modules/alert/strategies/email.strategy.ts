import { Resend } from 'resend';
import { IAlertStrategy } from './alert-strategy.interface.js';
import { AlertPayload } from '../alert.types.js';
import { generateHtmlTemplate } from '../lib/utils.js';

export class EmailAlertStrategy implements IAlertStrategy {
    readonly channelName = 'email' as const;
    private resend: Resend;
    private fromEmail: string;

    constructor() {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error('[EmailStrategy] Missing RESEND_API_KEY in environment variables.');
        }

        // Initialize Resend SDK instance
        this.resend = new Resend(apiKey);
        this.fromEmail = process.env.ALERT_FROM_EMAIL || 'onboarding@resend.dev';
    }

    async send(payload: AlertPayload): Promise<void> {
        const { recipient, title, message, metadata } = payload;

        // 1. Generate clean HTML template for the alert
        const htmlBody = generateHtmlTemplate(title, message, metadata);

        // 2. Call Resend API
        const { data, error } = await this.resend.emails.send({
            from: `GitHub Monitor <${this.fromEmail}>`,
            to: [recipient],
            subject: `🚨 ${title}`,
            html: htmlBody,
        });

        // 3. Handle Errors -> Throwing forces BullMQ to trigger automatic retries!
        if (error) {
            console.error(`[EmailStrategy] Resend API Error:`, error);
            throw new Error(`Failed to send email via Resend: ${error.message}`);
        }

        console.log(`[EmailStrategy] Email dispatched successfully! Message ID: ${data?.id}`);
    }
}