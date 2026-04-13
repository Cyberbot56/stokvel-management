// config is loaded from config.js — do not redeclare it here.
let auth0Client = null;

const configureClient = async () => {
    auth0Client = await auth0.createAuth0Client({
        domain: config.domain,
        clientId: config.clientId,
        authorizationParams: {
            audience: config.audience,
            redirect_uri: window.location.origin,
            scope: "openid profile email"
        },

    });
};

const processLoginState = async () => {
    if (!auth0Client) return;

    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, "/");
    }

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
        // Only fetch user and redirect on the login page.
        // Prevents being pulled back to dashboard.html from every other page.
        const onLoginPage = window.location.pathname.endsWith("index.html") ||
                            window.location.pathname === "/";

        if (onLoginPage) {
            const token = await auth0Client.getTokenSilently();
            const userProfile = await auth0Client.getUser();

            const response = await fetch(`${config.apiBase}/api/auth/me`, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "x-user-name": userProfile.name,
                    "x-user-email": userProfile.email
                }
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const dbUser = await response.json();

            localStorage.setItem("userId", dbUser.userId);
            localStorage.setItem("userName", dbUser.name);

            window.location.href = "dashboard.html";
        }
    }
};


const logout = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    auth0Client.logout({
        logoutParams: {
            returnTo: window.location.origin
        }
    });
};

window.onload = async () => {
    try {
        await configureClient();
        try {
            await processLoginState();
        } catch (authErr) {
            console.error("Auth state error:", authErr);
        }

        if (!auth0Client) {
            console.error("Auth0 client failed to initialise.");
            return;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.onclick = logout;

        const btnGoogle = document.getElementById("btnGoogle");
        if (btnGoogle) {
            btnGoogle.onclick = async () => {
                try {
                    await auth0Client.loginWithRedirect({
                        authorizationParams: { connection: "google-oauth2" }
                    });
                } catch (err) {
                    console.error("Google login failed:", err);
                }
            };
        }

        const btnApple = document.getElementById("btnApple");
        if (btnApple) {
            btnApple.onclick = async () => {
                try {
                    await auth0Client.loginWithRedirect({
                        authorizationParams: { connection: "apple" }
                    });
                } catch (err) {
                    console.error("Apple login failed:", err);
                }
            };
        }

        // This allows page scripts like group-overview.js, allGroups.js, dashboard.js
        // to wait for auth0Client to be fully initialised before running.
        if (typeof onAuthReady === "function") {
            onAuthReady();
        }

    } catch (err) {
        console.error("Initialisation failed:", err);
    }
};