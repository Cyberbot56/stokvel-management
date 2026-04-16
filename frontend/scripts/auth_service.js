let auth0Client = null;

const configureClient = async () => {
    auth0Client = await auth0.createAuth0Client({
        domain: config.domain,
        clientId: config.clientId,
        authorizationParams: {
            audience: config.audience,
            // Always redirect back to the login page after Auth0 login
            redirect_uri: window.location.origin + "/pages/index.html",
            scope: "openid profile email"
        },
        useRefreshTokens: true,
        cacheLocation: "localstorage"
    });
};

const processLoginState = async () => {
    if (!auth0Client) return;

    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
        await auth0Client.handleRedirectCallback();
        // Clean the URL but stay on the current page
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
        // Only redirect to dashboard from the login/index page
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

            // Use absolute path so this works regardless of which page we're on
            window.location.href = window.location.origin + "/pages/dashboard.html";
        }
    }
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

        // Allows page scripts (allGroups.js, dashboard.js, etc.)
        // to wait for auth0Client to be ready before running
        if (typeof onAuthReady === "function") {
            onAuthReady();
        }

    } catch (err) {
        console.error("Initialisation failed:", err);
    }
};