export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  console.error(error.message);
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : 'Invalid request',
  });
}
