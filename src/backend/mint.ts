import { SignJWT } from "jose";

(async () => {
    // Generate a valid token signed with the default testing secret
    // Note: this will only work if the dev environment isn't strictly verifying against the real Cloudflare Secrets Store
    const secret = new TextEncoder().encode("LOCAL_DEV_SECRET"); 
    const token = await new SignJWT({ role: "ADMIN", scopes: ["*"] })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(secret);
    console.log("------------------------");
    console.log("BEARER TOKEN:", token);
    console.log("------------------------");
})();
