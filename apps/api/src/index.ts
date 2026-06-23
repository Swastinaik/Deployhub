import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { Server as SocketServer } from 'socket.io';
import { initSocketManager } from './modules/sockets/socket.service.js';
import { authrouter } from './modules/auth/auth.routes.js';
import { githubRouter } from './modules/github/github.routes.js';
import { connectMongo } from './lib/mongo.js';
import { workflowRouter } from './modules/workflowSync/workflow.routes.js';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { metricsTypeDefs } from './modules/metrics/metrics.scheme.js';
import { metricsResolver } from './modules/metrics/metrics.resolver.js';
// Load environment variables
dotenv.config();

const app = express();

// Security Middleware
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// CORS configuration - only allow web frontend in development/production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
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

connectMongo()
// connect to MongoDB


const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const HOST = process.env.HOST || '0.0.0.0';

app.use('/api/auth', authrouter);
app.use('/api/github', githubRouter);
app.use('/api/workflow', workflowRouter);

const apolloServer = new ApolloServer({
  typeDefs: metricsTypeDefs,
  resolvers: metricsResolver,
});
await apolloServer.start();
app.use('/graphql', expressMiddleware(apolloServer));

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

const io = new SocketServer(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});
initSocketManager(io);

export default server;
