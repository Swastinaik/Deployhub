export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Deployment {
  id: string;
  appName: string;
  status: 'idle' | 'building' | 'deployed' | 'failed';
  url?: string;
  createdAt: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}
