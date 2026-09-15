import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', healthRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
