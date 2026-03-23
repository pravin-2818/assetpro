function ipLogger(req, res, next) {
  const getRealIP = (req) =>
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const normalizeIP = (ip) => {
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
    if (ip?.startsWith('::ffff:')) return ip.substring(7);
    return ip;
  };

  req.realIP = normalizeIP(getRealIP(req));
  req.userInfo = {
    ip: req.realIP,
    userAgent: req.get('User-Agent') || 'Unknown',
    timestamp: new Date().toISOString()
  };
  next();
}

module.exports = { ipLogger };
