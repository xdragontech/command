import type { GetServerSideProps } from "next";
import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/router";
import { MIN_BACKOFFICE_PASSWORD_LENGTH } from "@command/core-auth-backoffice";
import { BackofficeAuthShell } from "../../components/BackofficeAuthShell";
import { buildSetupRedirect, isInstallInitialized } from "../../server/installState";

function readQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export default function AdminResetPasswordPage() {
  const router = useRouter();
  const userId = useMemo(() => readQueryValue(router.query.id), [router.query.id]);
  const token = useMemo(() => readQueryValue(router.query.token), [router.query.token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userId || !token) {
      setError("This password link is invalid or incomplete.");
      return;
    }

    if (password.length < MIN_BACKOFFICE_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          token,
          password,
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || "Failed to reset password");
      }

      setSuccess("Password updated. You can sign in to the backoffice now.");
      setPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        window.location.assign("/admin/signin?reset=1");
      }, 900);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BackofficeAuthShell
      pageTitle="Command Admin — Reset Password"
      eyebrow="Backoffice Access"
      title="Set your password"
      description="Use this one-time link to set a new password for your backoffice account."
    >
      {error ? <div style={errorStyle}>{error}</div> : null}
      {success ? <div style={successStyle}>{success}</div> : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: "16px" }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>New Password</span>
          <input
            style={inputStyle}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`Minimum ${MIN_BACKOFFICE_PASSWORD_LENGTH} characters`}
          />
        </label>

        <label style={fieldStyle}>
          <span style={labelStyle}>Confirm Password</span>
          <input
            style={inputStyle}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat password"
          />
        </label>

        <button type="submit" disabled={busy} style={primaryButtonStyle}>
          {busy ? "Updating..." : "Update Password"}
        </button>
      </form>
    </BackofficeAuthShell>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (!(await isInstallInitialized())) {
    return buildSetupRedirect();
  }

  return { props: {} };
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
