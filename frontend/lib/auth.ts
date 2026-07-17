import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

// Cookie names/options are pinned explicitly (rather than left to NextAuth's
// defaults) so local dev on http://localhost never ambiguously falls back to
// `secure` cookies, and so state/pkce cookies have a bounded, predictable
// lifetime — reducing the chance a leftover cookie from an abandoned or
// just-finished auth flow collides with the next sign-in attempt.
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;

// The backend authenticates every request with the caller's Google ID
// token, which Google issues valid for ~1 hour. Without this, whatever
// id_token was captured at sign-in keeps getting reused for the entire
// NextAuth session (default 30 days), so every backend call starts
// failing with 401 an hour after login — the sidebar's application
// history then silently goes empty (see refreshApplications in page.tsx),
// even though nothing was actually lost server-side.
//
// Fix: request offline access + a refresh_token at sign-in, and use it to
// silently mint a fresh id_token whenever the cached one is close to
// expiring. Google returns a new id_token from the refresh grant as long
// as the original authorization included the `openid` scope (it does, by
// default, via GoogleProvider).
async function refreshGoogleIdToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    // No refresh token to work with — most commonly because Google only
    // issues one on the *first* consent, and a stale JWT from before this
    // change won't have one. The caller will need to sign in again.
    return { ...token, error: "NoRefreshToken" };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID as string,
        client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      idToken: refreshed.id_token as string,
      idTokenExpiresAt: Math.floor(Date.now() / 1000) + (refreshed.expires_in as number),
      // Google usually does NOT return a new refresh_token on refresh —
      // keep reusing the original one unless it explicitly issues a new one.
      refreshToken: (refreshed.refresh_token as string | undefined) ?? token.refreshToken,
      error: undefined,
    };
  } catch (e) {
    console.error("Failed to refresh Google ID token:", e);
    return { ...token, error: "RefreshFailed" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          // access_type: "offline" is what makes Google issue a
          // refresh_token in the first place. prompt: "consent" forces the
          // consent screen (and therefore a refresh_token) on every sign-in
          // rather than only the very first time this Google account ever
          // authorized the app — important since this app has no database,
          // so nothing is persisted across NextAuth sessions to fall back on.
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  // Without this, any OAuth error — most commonly the user hitting
  // "Cancel" on Google's account chooser — lands on one of NextAuth's own
  // bare, unstyled built-in pages instead of the app. Which page depends
  // on the error type: some (e.g. AccessDenied) go to `error`, others
  // (e.g. "Callback", which covers OAuth callback failures) go to
  // `signIn` with an ?error= query param — so both need to point back at
  // the app. page.tsx doesn't care about that query param, it just shows
  // the normal step-1 sign-in screen, so nothing else is needed there.
  pages: {
    signIn: "/",
    error: "/",
  },
  session: {
    strategy: "jwt",
  },
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      // Deliberately NOT prefixed with __Host- (that prefix forbids the
      // `domain` attribute entirely, which is stricter than we need here).
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    state: {
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 900, // 15 minutes — matches the OAuth flow's realistic window
      },
    },
    pkceCodeVerifier: {
      name: `${useSecureCookies ? "__Secure-" : ""}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 900,
      },
    },
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile) return false;
      const emailVerified = (profile as { email_verified?: boolean }).email_verified;
      return emailVerified !== false;
    },
    async jwt({ token, account }) {
      // Initial sign-in: `account` is only populated on this one call.
      if (account) {
        return {
          ...token,
          idToken: account.id_token,
          refreshToken: account.refresh_token,
          // account.expires_at (seconds since epoch) is the access token's
          // expiry, but Google issues the id_token with the same lifetime,
          // so it's a reliable stand-in here.
          idTokenExpiresAt: account.expires_at,
        };
      }

      // Subsequent requests: keep using the cached id_token as long as it's
      // not about to expire (60s buffer for clock skew / request latency).
      const stillValid =
        typeof token.idTokenExpiresAt === "number" &&
        Date.now() < token.idTokenExpiresAt * 1000 - 60_000;
      if (stillValid) return token;

      return refreshGoogleIdToken(token);
    },
    async session({ session, token }) {
      session.idToken = token.idToken;
      session.error = token.error;
      return session;
    },
  },
};