const rateLimit = new Map();

const rateLimiter = (socket, next) => {
  const userId = socket.id; // Or use socket.handshake.address for IP based
  const now = Date.now();
  const limit = 50; // 50 events per 10 seconds
  const window = 10000;

  if (!rateLimit.has(userId)) {
    rateLimit.set(userId, { count: 1, lastReset: now });
    return next();
  }

  const userLimit = rateLimit.get(userId);
  if (now - userLimit.lastReset > window) {
    userLimit.count = 1;
    userLimit.lastReset = now;
    return next();
  }

  userLimit.count++;
  if (userLimit.count > limit) {
    return next(new Error('Rate limit exceeded. Please slow down.'));
  }

  next();
};

module.exports = rateLimiter;
