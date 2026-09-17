import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tickets', ticketRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
