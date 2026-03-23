function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.path}:`, err.message);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message, errors: err.details });
  }
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ success: false, message: 'A record with this value already exists.' });
  }
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(409).json({ success: false, message: 'Related record not found.' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = { errorHandler };
