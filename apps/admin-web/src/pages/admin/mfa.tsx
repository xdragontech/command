import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { getServerSession } from "next-auth/next";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { CSSProperties, FormEvent } from "react";
import {
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
import { buildSetupRedirect, isInstallInitialized } from "../../server/installState";
import { getApiRequestHost } from "../../server/requestHost";

type BackofficeMfaPageProps = {
  callbackUrl: string;
  username: string;
  allowedHosts: string[];
  recommendedAdminHost: string | null;
};

export const getServerSideProps: GetServerSideProps<BackofficeMfaPageProps> = async (ctx) => {
  if (!(await isInstallInitialized())) {
    return buildSetupRedirect();
  }

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const runtimeHost = await getRuntimeHostConfig(getApiRequestHost(ctx.req));
  const callbackUrl = typeof ctx.query.callbackUrl === "string" ? ctx.query.callbackUrl : null;

  if (!isBackofficeSession(session)) {
    return {
      redirect: {
        destination: `/admin/signin?callbackUrl=${encodeURIComponent(callbackUrl || "/admin/library")}`,
        permanent: false,
      },
    };
  }

  const destination = callbackUrl || resolveBackofficePostAuthDestination(session);
  if (!requiresBackofficeMfaChallenge(session)) {
    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  if (hasVerifiedBackofficeMfaForRequest(ctx.req, session)) {
    return {
      redirect: {
        destination,
        permanent: false,
      },
    };
  }

  return {
    props: {
      callbackUrl: destination,
      username:
        String((session as any)?.user?.email || (session as any)?.user?.username || (session as any)?.user?.name || "staff"),
      allowedHosts: runtimeHost.allowedHosts,
      recommendedAdminHost: runtimeHost.canonicalAdminHost,
    },
  };
};

export default function AdminMfaPage({
  callbackUrl: initialCallbackUrl,
  username,
  allowedHosts,
  recommendedAdminHost,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return initialCallbackUrl;
    return normalizeCallbackUrl((router.query.callbackUrl as any) || initialCallbackUrl, window.location.origin, allowedHosts);
  }, [allowedHosts, initialCallbackUrl, router.query.callbackUrl]);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const input = code.trim();
    if (!input) {
      setError("Enter your 6-digit authenticator code or a recovery code.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/mfa/challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: input }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || "MFA verification failed");
      }

      setSuccess(body?.result?.usedRecoveryCode ? "Recovery code accepted. Redirecting..." : "Authenticator verified. Redirecting...");
      window.location.assign(callbackUrl || "/admin/library");
    } catch (nextError: any) {
      setError(nextError?.message || "MFA verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BackofficeAuthShell
      pageTitle="Command Admin — Verify Sign In"
      eyebrow="Multi-Factor Authentication"
      title="Verify your sign-in"
      description={
        <>
          Enter the 6-digit code from your authenticator app, or use a recovery code for{" "}
          <span style={{ fontWeight: 700 }}>{username}</span>.
        </>
      }
      footer={
        <>
          Use the same admin host throughout sign-in and verification. Recommended:
          <span style={{ fontWeight: 700 }}>{` https://${recommendedAdminHost || "your-admin-host"}`}</span>
        </>
      }
    >
      {error ? <div style={errorStyle}>{error}</div> : null}
      {!error && success ? <div style={successStyle}>{success}</div> : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: "16px" }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Authenticator or recovery code</span>
          <input
            style={inputStyle}
            type="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456 or ABCD-EFGH-IJKL"
          />
        </label>

        <button type="submit" disabled={busy} style={primaryButtonStyle}>
          {busy ? "Verifying..." : "Verify Sign In"}
        </button>
      </form>
    </BackofficeAuthShell>
  );
}

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
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "1rem",
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: "12px",
  padding: "13px 16px",
  background: "#0f172a",
  color: "#fff",
  fontSize: "0.98rem",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "#fef2f2",
  color: "#991b1b",
  padding: "12px 14px",
  marginBottom: "18px",
};

const successStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(16,185,129,0.24)",
  background: "#ecfdf5",
  color: "#065f46",
  padding: "12px 14px",
  marginBottom: "18px",
};
