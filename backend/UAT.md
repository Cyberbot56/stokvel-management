# User Acceptance Tests — Story #1

## As a user, I want to register and log in via a third-party identity provider, so that my account is secure.

### UAT-1: Unauthenticated access is blocked

- **Given** a user has no access token
- **When** they call GET /me
- **Then** the server returns 401 Unauthorized

### UAT-2: Health check is publicly accessible

- **Given** the server is running
- **When** any client calls GET /health
- **Then** the server returns 200 with { "status": "ok" }

### UAT-3: Admin route is protected

- **Given** a user has no access token
- **When** they call GET /admin
- **Then** the server returns 401 Unauthorized

### UAT-4: Authenticated user is provisioned on first login

- **Given** a valid Auth0 token is provided
- **When** the user calls GET /me
- **Then** the server returns the user profile with role MEMBER

### UAT-5: Member cannot access admin routes

- **Given** a valid Auth0 token with role MEMBER
- **When** the user calls GET /admin
- **Then** the server returns 403 Forbidden
