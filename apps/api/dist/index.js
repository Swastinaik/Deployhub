"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
// Security Middleware
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
// CORS configuration - only allow web frontend in development/production
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow server-to-server or curl requests (origin is undefined)
        if (!origin)
            return callback(null, true);
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
const deployments = [
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
    const healthResponse = {
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
    const newDeployment = {
        id: (deployments.length + 1).toString(),
        appName: appName.trim(),
        status: 'idle',
        createdAt: new Date().toISOString()
    };
    deployments.push(newDeployment);
    res.status(201).json(newDeployment);
});
// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err.message);
    // SECURITY: Do not expose internal details in error messages
    res.status(500).json({ error: 'Internal Server Error' });
});
// Start the server
const server = app.listen(PORT, HOST, () => {
    console.log(`[API] Server listening securely on http://${HOST}:${PORT}`);
});
exports.default = server;
