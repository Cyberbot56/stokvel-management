// backend/tests/auth.test.js
const { PrismaClient } = require('@prisma/client');

// Mock the Auth0 middleware FIRST
jest.mock('express-oauth2-jwt-bearer', () => ({
  auth: jest.fn(() => (req, res, next) => {
    // Simulate successful token verification with user data from headers
    if (!req.headers.authorization) {
      return next(new Error('Missing authorization header'));
    }
    
    req.auth = {
      payload: {
        sub: req.headers['x-user-sub'] || 'auth0_test_123',
        email: req.headers['x-user-email'] || 'test@example.com',
        name: req.headers['x-user-name'] || 'Test User'
      }
    };
    next();
  })
}));

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    users: {
      upsert: jest.fn()
    }
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

// Import after mocks
const { requireAuth } = require('../src/middleware/auth');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let prisma;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Get prisma instance
    prisma = new PrismaClient();
    
    // Setup mock request
    mockReq = {
      headers: {}
    };
    
    // Setup mock response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    // Setup mock next function
    mockNext = jest.fn();
    
    // Suppress console.error for cleaner test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Successful Authentication', () => {
    test('should authenticate user and upsert into database', async () => {
      const mockUser = {
        userId: 1,
        providerId: 'auth0_test_123',
        email: 'john@example.com',
        name: 'John Doe'
      };
      
      prisma.users.upsert.mockResolvedValue(mockUser);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'auth0_test_123',
        'x-user-email': 'john@example.com',
        'x-user-name': 'John Doe'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(prisma.users.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.users.upsert).toHaveBeenCalledWith({
        where: { providerId: 'auth0_test_123' },
        update: {
          name: 'John Doe',
          email: 'john@example.com'
        },
        create: {
          providerId: 'auth0_test_123',
          email: 'john@example.com',
          name: 'John Doe'
        }
      });
      expect(mockReq.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should handle missing user info from headers', async () => {
      const mockUser = {
        userId: 1,
        providerId: 'auth0_test_123',
        email: 'auth0_test_123@noemail.local',
        name: 'Stokvel User'
      };
      
      prisma.users.upsert.mockResolvedValue(mockUser);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'auth0_test_123'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(prisma.users.upsert).toHaveBeenCalledWith({
        where: { providerId: 'auth0_test_123' },
        update: {
          name: undefined,
          email: undefined
        },
        create: {
          providerId: 'auth0_test_123',
          email: 'auth0_test_123@noemail.local',
          name: 'Stokvel User'
        }
      });
      expect(mockReq.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should handle when headers are undefined', async () => {
      const mockUser = {
        userId: 1,
        providerId: 'auth0_test_123',
        email: 'auth0_test_123@noemail.local',
        name: 'Stokvel User'
      };
      
      prisma.users.upsert.mockResolvedValue(mockUser);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'auth0_test_123'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(prisma.users.upsert).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('Authentication Errors', () => {
    test('should handle missing authorization header', async () => {
      mockReq.headers = {};
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Missing authorization header');
      expect(prisma.users.upsert).not.toHaveBeenCalled();
    });

    test('should handle database error during upsert', async () => {
      const dbError = new Error('Database connection failed');
      prisma.users.upsert.mockRejectedValue(dbError);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'auth0_test_123',
        'x-user-email': 'test@example.com',
        'x-user-name': 'Test User'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Database error' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle database error with null error message', async () => {
      const dbError = new Error();
      dbError.message = null;
      prisma.users.upsert.mockRejectedValue(dbError);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'auth0_test_123'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Database error' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle sub from headers correctly', async () => {
      const mockUser = {
        userId: 1,
        providerId: 'google_oauth_99999',
        email: 'unique@example.com',
        name: 'Unique User'
      };
      
      prisma.users.upsert.mockResolvedValue(mockUser);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'google_oauth_99999',
        'x-user-email': 'unique@example.com',
        'x-user-name': 'Unique User'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(prisma.users.upsert).toHaveBeenCalledWith({
        where: { providerId: 'google_oauth_99999' },
        update: {
          name: 'Unique User',
          email: 'unique@example.com'
        },
        create: {
          providerId: 'google_oauth_99999',
          email: 'unique@example.com',
          name: 'Unique User'
        }
      });
      expect(mockReq.user).toEqual(mockUser);
    });

    test('should handle empty strings in headers', async () => {
      const mockUser = {
        userId: 1,
        providerId: 'auth0_12345',
        email: '',
        name: ''
      };
      
      prisma.users.upsert.mockResolvedValue(mockUser);
      
      mockReq.headers = {
        authorization: 'Bearer valid-token',
        'x-user-sub': 'auth0_12345',
        'x-user-email': '',
        'x-user-name': ''
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      
      expect(prisma.users.upsert).toHaveBeenCalledWith({
        where: { providerId: 'auth0_12345' },
        update: {
          name: undefined,
          email: undefined
        },
        create: {
          providerId: 'auth0_12345',
          email: '',
          name: ''
        }
      });
      expect(mockReq.user).toEqual(mockUser);
    });
  });

  describe('Integration-like Tests', () => {
    test('should process multiple requests sequentially', async () => {
      const mockUser1 = { userId: 1, providerId: 'user1', email: 'user1@test.com', name: 'User One' };
      const mockUser2 = { userId: 2, providerId: 'user2', email: 'user2@test.com', name: 'User Two' };
      
      prisma.users.upsert
        .mockResolvedValueOnce(mockUser1)
        .mockResolvedValueOnce(mockUser2);
      
      // First request
      mockReq.headers = {
        authorization: 'Bearer token1',
        'x-user-sub': 'user1',
        'x-user-email': 'user1@test.com',
        'x-user-name': 'User One'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      expect(mockReq.user).toEqual(mockUser1);
      
      // Second request
      mockReq.headers = {
        authorization: 'Bearer token2',
        'x-user-sub': 'user2',
        'x-user-email': 'user2@test.com',
        'x-user-name': 'User Two'
      };
      
      await requireAuth(mockReq, mockRes, mockNext);
      expect(mockReq.user).toEqual(mockUser2);
      
      expect(prisma.users.upsert).toHaveBeenCalledTimes(2);
    });
  });
});