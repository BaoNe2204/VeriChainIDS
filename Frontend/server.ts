import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());

  // --- Mock Database ---
  let pricingPlans = [
    { id: '1', name: 'Starter', price: '0', features: ['3 Agents', 'Basic Regex Detection', 'Email Alerts', '7-day Log Retention'], popular: false },
    { id: '2', name: 'Pro', price: '2.500.000', features: ['10 Agents', 'AI Anomaly Detection', 'SignalR Real-time', 'MITRE Mapping', '30-day Retention'], popular: true },
    { id: '3', name: 'Enterprise', price: 'Custom', features: ['Unlimited Agents', 'Dedicated AI Engine', 'SOAR Automation', 'ISO Compliance', '1-year Retention'], popular: false },
  ];

  let users = [
    { id: 'admin-1', fullName: 'Tuandevil Admin', username: 'admin', email: 'Tuandevilgaming666@gmail.com', role: 'superAdmin', status: 'active' },
    { id: 'user-1', fullName: 'Standard User', username: 'user', email: 'user@example.com', role: 'user', status: 'active' },
    { id: 'user-2', fullName: 'Jane Smith', username: 'janesmith', email: 'jane@example.com', role: 'user', status: 'inactive' },
  ];

  let systemLogs = [
    { id: 1, type: 'INFO', message: 'User admin logged in successfully', user: 'admin', time: '2024-03-25 14:30:22', ip: '192.168.1.1' },
    { id: 2, type: 'WARNING', message: 'Failed login attempt for user: guest', user: 'guest', time: '2024-03-25 14:35:10', ip: '10.0.0.5' },
    { id: 3, type: 'ERROR', message: 'Database connection timeout on Node-Primary', user: 'SYSTEM', time: '2024-03-25 14:40:05', ip: '172.16.0.10' },
    { id: 4, type: 'INFO', message: 'New API Key generated: Production API', user: 'admin', time: '2024-03-25 14:45:15', ip: '192.168.1.1' },
    { id: 5, type: 'INFO', message: 'Settings updated: Language changed to VI', user: 'user', time: '2024-03-25 14:50:30', ip: '192.168.1.50' },
  ];

  let apiGuide = {
    title: 'VeriChainIDS API Documentation',
    description: 'Integrate VeriChainIDS security features into your own applications using our RESTful API.',
    sections: [
      {
        id: 'auth',
        title: 'Authentication',
        content: 'All API requests require an API Key passed in the `X-API-Key` header. You can generate keys in the Settings > API Key Management section.'
      },
      {
        id: 'endpoints',
        title: 'Core Endpoints',
        content: 'GET /api/v1/alerts - Fetch recent security alerts\nPOST /api/v1/agents - Register a new agent\nGET /api/v1/stats - Get real-time SOC statistics'
      }
    ]
  };

  // --- API Routes ---
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
    if (user && password === '123') {
      return res.json({
        success: true,
        user
      });
    }

    res.status(401).json({ success: false, message: 'Invalid credentials' });
  });

  app.get('/api/users', (req, res) => {
    res.json(users);
  });

  app.post('/api/users/update', (req, res) => {
    const { user } = req.body;
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      users[index] = { ...users[index], ...user };
      io.emit('users_updated', users);
      res.json({ success: true, users });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  });

  app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    users = users.filter(u => u.id !== id);
    io.emit('users_updated', users);
    res.json({ success: true, users });
  });

  app.get('/api/logs', (req, res) => {
    res.json(systemLogs);
  });

  app.get('/api/guide', (req, res) => {
    res.json(apiGuide);
  });

  app.post('/api/guide/update', (req, res) => {
    const { guide } = req.body;
    apiGuide = guide;
    io.emit('guide_updated', apiGuide);
    res.json({ success: true, guide: apiGuide });
  });

  app.get('/api/pricing', (req, res) => {
    res.json(pricingPlans);
  });

  app.post('/api/pricing/update', (req, res) => {
    const { plans } = req.body;
    pricingPlans = plans;
    
    // Broadcast to all clients
    io.emit('pricing_updated', pricingPlans);
    
    res.json({ success: true, plans: pricingPlans });
  });

  // --- Socket.io ---
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
