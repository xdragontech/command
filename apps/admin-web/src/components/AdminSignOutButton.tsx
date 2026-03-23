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
    <>
      <button type="button" onClick={onClick} disabled={busy} className="signOutButton">
        <span className="signOutDot" />
        {busy ? "Signing out..." : "Sign out"}
      </button>

      <style jsx>{`
        .signOutButton {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 999px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.88);
          color: #0f172a;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: ${busy ? "wait" : "pointer"};
          opacity: ${busy ? 0.72 : 1};
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          transition:
            transform 140ms ease,
            box-shadow 140ms ease,
            border-color 140ms ease;
        }

        .signOutButton:hover {
          transform: translateY(-1px);
          border-color: rgba(148, 163, 184, 0.36);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
        }

        .signOutDot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
          box-shadow: 0 0 0 4px rgba(248, 113, 113, 0.14);
        }
      `}</style>
    </>
  );
}
