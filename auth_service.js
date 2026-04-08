let auth0Client=null;

const config={
    domain:"dev-hwccoku5xvsxv2op.eu.auth0.com",
    clientId:"4ylzMiMqrtbYYZRhYZHZHs56ZZxfgQsO", 
    audience :"https://api.stokvel.app/",
};

const configureClient = async()=>{
    auth0Client = await auth0.createAuth0Client({
        domain: config.domain,
        clientId: config.clientId,
        authorizationParams: {
            audience: config.audience,
            redirect_uri: window.location.origin
        },
        //Stay logged in after refreshing.
        useRefreshTokens: true,  
        cacheLocation: 'localstorage'
    });
};

const processLoginState = async()=>{
    const query = window.location.search;
    if(query.includes("code=")&&query.includes("state=")){
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, "/");
    }
    const isAuthenticated = await auth0Client.isAuthenticated();
    if(isAuthenticated){
        console.log("user is logged in");
        const token = await auth0Client.getTokenSilently();
        console.log("Your Access Token:", token);
    }
};

window.onload =async() =>{
    await configureClient();
    await processLoginState();

    document.getElementById("btnGoogle").onclick = async() =>{
        await auth0Client.loginWithRedirect({
            authorizationParams: { connection: 'google-oauth2' }
        });
    };

    document.getElementById("btnApple").onclick = async() =>{
        await auth0Client.loginWithRedirect({
            authorizationParams: { connection: 'apple' }
        });
    };

};

