# Hello World

## CI/CD Status

[![Tests](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Cyberbot56/16ba4c80de63c1e13ccd0cc391c7e861/raw/stokvel-test-badge.json)](https://github.com/Cyberbot56/stokvel-management/actions)
[![Coverage Status](https://codecov.io/gh/cyberbot56/stokvel-management/branch/main/graph/badge.svg)](https://codecov.io/gh/cyberbot56/stokvel-management)

## Live Demo

[https://stokvel-management-cpox.vercel.app](https://stokvel-management-cpox.vercel.app)

---

## Table of Contents

- [About](#about)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Running Tests](#running-tests)

---

## About

Stokvel Management Platform is a web application that aims to deliver a web-based stokvel management platform that enables members to track contributions, monitor payout schedules, communicate, and gain financial insights into their savings group. It is built with a Node.js/Express backend, Prisma ORM, and a vanilla JS frontend, authenticated via Auth0.

---

## Project Structure

```
stokvel-management/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│       ├── coverage.yml
│       └── deploy.yml
├── backend/
│   ├── server.js              # Main Express server
│   ├── .env.example           # Environment variable template
│   └── src/
│       └── middleware/
│           └── auth.js        # Auth0 middleware
│   └── tests/
│       ├── auth.test.js
│       └── server.test.js
├── frontend/
│   ├── css/                   # Stylesheets
│   ├── pages/                 # HTML pages
│   └── scripts/               # Frontend JS
├── prisma/
│   └── schema.prisma          # Database schema
├── package.json
└── README.md
```

---

## Prerequisites

Make sure you have the following installed before running the project:

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) v8 or higher
- A PostgreSQL database (local or hosted e.g. Neon, Supabase)
- An [Auth0](https://auth0.com/) account for authentication

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Cyberbot56/stokvel-management.git
cd stokvel-management
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp backend/.env.example .env
```

Open `.env` and fill in the required values (see [Environment Variables](#environment-variables) below).

### 4. Generate the Prisma client

```bash
npx prisma generate
```

### 5. Push the database schema

```bash
npx prisma db push
```

---

## Environment Variables

Create a `.env` file in the root of the project with the following variables:

```env
# Database
DATABASE_URL=postgresql://username:password@host:5432/dbname

# Auth0
AUTH0_DOMAIN=your-auth0-domain.auth0.com
AUTH0_AUDIENCE=your-auth0-audience

# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5500
```

> Refer to `backend/.env.example` for the full list of required variables.

---

## Running Locally

### Start the backend server

```bash
node backend/server.js
```

The server will start on `http://localhost:3000`.

### Open the frontend

Open `frontend/pages/index.html` in your browser using a live server extension (e.g. VS Code Live Server on port 5500), or navigate directly to:

```
http://localhost:5500/frontend/pages/index.html
```

> Make sure `FRONTEND_URL=http://localhost:5500` is set in your `.env` so CORS allows the frontend to communicate with the backend.

---

## Running Tests

Run all tests with coverage:

```bash
npm test -- --coverage --verbose
```

Run tests without coverage:

```bash
npm test
```

Tests are located in:

```
backend/tests/
├── auth.test.js      # Auth middleware tests
└── server.test.js    # API endpoint tests
```

> All Prisma and Auth0 dependencies are mocked in tests — no real database connection is needed to run the test suite.
