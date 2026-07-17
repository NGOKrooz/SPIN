const defaultOrigins = [
  'https://spin-j3qw.onrender.com', // <-- current production frontend
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:5000',
];

const parseAllowedOrigins = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const getAllowedOrigins = () => {
  const configuredOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || process.env.CLIENT_URL || '');
  return Array.from(new Set([...configuredOrigins, ...defaultOrigins]));
};

const buildCorsOptions = (allowedOrigins = getAllowedOrigins()) => ({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`Blocked CORS origin: ${origin}`);
    return callback(new Error('CORS not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
  preflightContinue: false,
});

module.exports = {
  defaultOrigins,
  parseAllowedOrigins,
  getAllowedOrigins,
  buildCorsOptions,
};
