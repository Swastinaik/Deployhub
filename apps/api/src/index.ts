import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { HealthCheckResponse, Deployment } from '@deployhub/shared';

// Load environment variables
dotenv.config();

const app = express();

// Security Middleware
app.use(helmet());
app.use(express.json());

// CORS configuration - only allow web frontend in development/production
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server or curl requests (origin is undefined)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: This origin is not allowed access.'), false);
  },
  credentials: true
}));

// Port & Host configuration
// SECURITY: Default to localhost/127.0.0.1 to avoid exposing the port externally during testing.
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const HOST = process.env.HOST || '127.0.0.1';

// In-memory data store for demonstration
const deployments: Deployment[] = [
  {
    id: '1',
    appName: 'nextjs-web-app',
    status: 'deployed',
    url: 'https://web.deployhub.local',
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    appName: 'express-api-service',
    status: 'building',
    createdAt: new Date().toISOString()
  }
];

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const healthResponse: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
  res.json(healthResponse);
});

// Deployments Endpoints
app.get('/api/deployments', (req, res) => {
  res.json(deployments);
});

app.post('/api/deployments', (req, res) => {
  const { appName } = req.body;
  if (!appName || typeof appName !== 'string' || appName.trim() === '') {
    res.status(400).json({ error: 'Valid appName is required' });
    return;
  }

  // TODO(security): Implement CSRF token validation and session/auth checks here

  const newDeployment: Deployment = {
    id: (deployments.length + 1).toString(),
    appName: appName.trim(),
    status: 'idle',
    createdAt: new Date().toISOString()
  };

  deployments.push(newDeployment);
  res.status(201).json(newDeployment);
});

// Global Error Handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err.message);
  // SECURITY: Do not expose internal details in error messages
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
const server = app.listen(PORT, HOST, () => {
  console.log(`[API] Server listening securely on http://${HOST}:${PORT}`);
});

export default server;
