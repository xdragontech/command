import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { getSession, signIn } from "next-auth/react";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { CSSProperties, FormEvent } from "react";
import {
  BACKOFFICE_CREDENTIALS_PROVIDER_ID,
  isBackofficeSession,
  requiresBackofficeMfaChallenge,
} from "@command/core-auth-backoffice";
import { getRuntimeHostConfig } from "@command/core-brand-runtime";
import { BackofficeAuthShell } from "../../components/BackofficeAuthShell";
import { normalizeCallbackUrl } from "../../lib/callbackUrl";
import { authOptions } from "../../server/authOptions";
import {
  hasVerifiedBackofficeMfaForRequest,
  resolveBackofficePostAuthDestination,
} from "../../server/backofficeAuth";
import { getApiRequestHost } from "../../server/requestHost";

type AdminSignInProps = {
  allowedHosts: string[];
  recommendedAdminHost: string | null;
};

function prettyAuthError(err?: string | null): string | null {
  if (!err) return null;
  const map: Record<string, string> = {
    CredentialsSignin: "Invalid email or password.",
    AccessDenied: "Access denied.",
    Configuration: "Auth configuration error. Check the admin-web env.",
    Verification: "Verification failed. Please try again.",
  };
  return map[err] || err;
}

export default function AdminSignInPage({ allowedHosts, recommendedAdminHost }: AdminSignInProps) {
  const router = useRouter();
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "/admin/dashboard";
    return normalizeCallbackUrl(router.query.callbackUrl as any, window.location.origin, allowedHosts);
  }, [allowedHosts, router.query.callbackUrl]);
  const initialErr = useMemo(() => {
    const value = router.query.error;
    return typeof value === "string" ? prettyAuthError(value) : null;
  }, [router.query.error]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialErr);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      setError("Please enter your username or email and password.");
      return;
    }

    setBusy(true);
    try {
      const result = await signIn(BACKOFFICE_CREDENTIALS_PROVIDER_ID, {
        redirect: false,
        email: normalizedEmail,
        password: normalizedPassword,
        callbackUrl,
      });

      if (!result) {
        setError("Sign-in failed. Please try again.");
        return;
      }

      if (result.ok) {
        const session = await getSession();
        if (!isBackofficeSession(session)) {
          setError(
            "Signed in, but your admin session was not established. This is usually a cookie or canonical-domain mismatch. " +
              `Use https://${recommendedAdminHost || "your-admin-host"} and verify NEXTAUTH_URL plus host config.`
          );
          return;
        }

        const target = callbackUrl || resolveBackofficePostAuthDestination(session);
        if (requiresBackofficeMfaChallenge(session)) {
          window.location.assign(`/admin/mfa?callbackUrl=${encodeURIComponent(target)}`);
          return;
        }

        window.location.assign(target);
        return;
      }

      setError(prettyAuthError(result.error) || "Sign-in failed. Please try again.");
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BackofficeAuthShell
      pageTitle="Command Admin — Sign in"
      eyebrow="Backoffice Access"
      title="Sign in"
      description="Use your backoffice credentials to access Command."
      footer={
        <>
          Use the same admin host throughout sign-in. Recommended:
          <span style={{ fontWeight: 700 }}>{` https://${recommendedAdminHost || "your-admin-host"}`}</span>
        </>
      }
    >
      {error ? (
        <div style={errorStyle}>{error}</div>
      ) : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: "16px" }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Username or email</span>
          <input
            style={inputStyle}
            type="text"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="grant or you@example.com"
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Password</span>
          <input
            style={inputStyle}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>

        <button type="submit" disabled={busy} style={primaryButtonStyle}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </BackofficeAuthShell>
  );
}

export const getServerSideProps: GetServerSideProps<AdminSignInProps> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const runtimeHost = await getRuntimeHostConfig(getApiRequestHost(ctx.req));

  if (isBackofficeSession(session)) {
    const destination = resolveBackofficePostAuthDestination(session);
    if (requiresBackofficeMfaChallenge(session) && !hasVerifiedBackofficeMfaForRequest(ctx.req, session)) {
      return {
        redirect: {
          destination: `/admin/mfa?callbackUrl=${encodeURIComponent(destination)}`,
          permanent: false,
        },
      };
    }

    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  return {
    props: {
      allowedHosts: runtimeHost.allowedHosts,
      recommendedAdminHost: runtimeHost.canonicalAdminHost,
    },
  };
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

const labelStyle: CSSProperties = {
  fontSize: "0.92rem",
  fontWeight: 600,
  color: "#1e293b",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.45)",
  borderRadius: "14px",
  padding: "12px 14px",
  fontSize: "1rem",
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: "14px",
  padding: "13px 16px",
  background: "#0f172a",
  color: "#fff",
  fontSize: "0.98rem",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  borderRadius: "14px",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "#fef2f2",
  color: "#991b1b",
  padding: "12px 14px",
  marginBottom: "18px",
};
