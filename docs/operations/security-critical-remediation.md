# Critical authentication remediation rollout

This release removes the development identity fallback, deletes the application’s demo-password creation path, and disables self-service enrollment. Only users created through an administrator-issued invitation can access the shared workspace.

Before deploying, make sure at least one legitimate administrator already exists in the production workspace. The application retires the legacy demo identity on first startup by removing its password credential, revoking its sessions and reset tokens, and deactivating that account. Do not deploy this release until a legitimate administrator can sign in.

Configure `AUTH_SESSION_SECRET` as a Cloudflare Worker secret before deployment. It must be a unique cryptographically random value of at least 32 characters; do not place it in `infra/cloudflare/wrangler.jsonc`, `.env.example`, source code, or client-side configuration. For example:

```sh
openssl rand -base64 48 | wrangler secret put AUTH_SESSION_SECRET
```

Confirm the deployed environment has this secret before serving traffic. Without it, all authenticated application routes and all session-issuing flows intentionally return HTTP 503.

For a new production database, provision the first account and administrator directly through the deployment’s controlled database-administration process, then create further users exclusively through **Admin Users → Invite teammate**. The application intentionally has no unauthenticated first-admin setup route.

After deployment, verify:

1. Requests without a valid, stored signed session receive HTTP 401.
2. `POST /api/auth/signup` receives HTTP 403.
3. An uninvited Google account is redirected back with an invitation-required error.
4. An invited user can accept an invitation and sign in with either their invited password or their already-invited Google email.
5. The legacy demo user cannot sign in and has no active sessions.
