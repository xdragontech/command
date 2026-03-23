import { signOut } from "next-auth/react";
import { useState } from "react";

export function AdminSignOutButton() {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await signOut({ callbackUrl: "/admin/signin" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        border: 0,
        borderRadius: "12px",
        padding: "8px 12px",
        background: "#0f172a",
        color: "#fff",
        fontSize: "0.9rem",
        fontWeight: 700,
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.72 : 1,
      }}
    >
      {busy ? "Signing out..." : "Sign Out"}
    </button>
  );
}
