import { IAlertStrategy } from './strategies/alert-strategy.interface.js';
import { EmailAlertStrategy } from './strategies/email.strategy.js';
import { AlertChannel } from './alert.types.js';

export class AlertStrategyFactory {
    private static strategies: Map<AlertChannel, IAlertStrategy> = new Map();

    static {
        this.registerStrategy(new EmailAlertStrategy());
    }

    public static registerStrategy(strategy: IAlertStrategy): void {
        this.strategies.set(strategy.channelName, strategy);
    }

    public static getStrategy(channel: AlertChannel): IAlertStrategy {
        const strategy = this.strategies.get(channel);
        if (!strategy) {
            throw new Error(`[AlertFactory] Unsupported alert channel: ${channel}`);
        }
        return strategy;
    }
}