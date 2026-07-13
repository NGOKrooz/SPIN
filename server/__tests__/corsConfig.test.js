const { getAllowedOrigins, buildCorsOptions } = require('../config/cors');

describe('cors config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.FRONTEND_URL;
    delete process.env.CLIENT_URL;
    delete process.env.REACT_APP_API_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('includes the Railway frontend origin by default', () => {
    const allowedOrigins = getAllowedOrigins();
    expect(allowedOrigins).toContain('https://spin.up.railway.app');
  });

  it('allows custom production origins from environment variables', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://example.com, https://admin.example.com';

    const allowedOrigins = getAllowedOrigins();

    expect(allowedOrigins).toContain('https://example.com');
    expect(allowedOrigins).toContain('https://admin.example.com');
  });

  it('accepts a configured origin in the cors callback', () => {
    const options = buildCorsOptions(['https://spin.up.railway.app']);

    options.origin('https://spin.up.railway.app', (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(true);
    });
  });
});
