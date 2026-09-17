export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  // Parser/database error messages can contain submitted data. Do not log them.
  console.error('Request failed with status', status);
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : 'Invalid request',
  });
}
