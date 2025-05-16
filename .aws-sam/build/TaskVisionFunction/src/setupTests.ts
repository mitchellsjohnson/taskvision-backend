import dotenv from 'dotenv';

// Load environment variables from .env.test if it exists, otherwise from .env
dotenv.config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '6061'; // Use a different port for testing 

// Mock environment variables for testing
process.env.AUTH0_DOMAIN = 'test-domain.auth0.com';
process.env.AUTH0_AUDIENCE = 'https://test-api.com';
process.env.CLIENT_ORIGIN_URL = 'http://localhost:3000';

// Add any other global test setup here 