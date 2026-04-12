// Centralised config — load this FIRST before auth_service.js and any page scripts.
const config = {
    domain: "dev-hwccoku5xvsxv2op.eu.auth0.com",
    clientId: "4ylzMiMqrtbYYZRhYZHZHs56ZZxfgQsO",
    audience: "https://api.stokvel.app",
    apiBase: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000"
        : "https://your-app.onrender.com" // <-- replace with your Render URL after deploying backend
};