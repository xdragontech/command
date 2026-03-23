import type { ReactNode } from "react";

type AdminCardProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminCard({ title, description, actions, children }: AdminCardProps) {
  return (
    <>
      <section className="adminCard">
        <div className="cardGlow" />

        <div className="cardHeader">
          <div className="cardHeaderCopy">
            <div className="cardEyebrow">Command Module</div>
            <h2 className="cardTitle">{title}</h2>
            {description ? <div className="cardDescription">{description}</div> : null}
          </div>

          {actions ? <div className="cardActions">{actions}</div> : null}
        </div>

        <div className="cardDivider" />
        <div className="cardBody">{children}</div>
      </section>

      <style jsx>{`
        .adminCard {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
          backdrop-filter: blur(18px);
          padding: 24px;
        }

        .cardGlow {
          position: absolute;
          top: -80px;
          right: -70px;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.12), rgba(14, 165, 233, 0));
          pointer-events: none;
        }

        .cardHeader {
          position: relative;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .cardHeaderCopy {
          min-width: 0;
          display: grid;
          gap: 10px;
        }

        .cardEyebrow {
          color: #64748b;
          font-size: 0.74rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .cardTitle {
          margin: 0;
          font-size: clamp(1.35rem, 2vw, 1.8rem);
          line-height: 1.05;
          letter-spacing: -0.04em;
          color: #0f172a;
        }

        .cardDescription {
          color: #475569;
          font-size: 0.97rem;
          line-height: 1.75;
          max-width: 72ch;
        }

        .cardActions {
          position: relative;
          z-index: 1;
        }

        .cardDivider {
          height: 1px;
          margin: 18px 0 20px;
          background: linear-gradient(90deg, rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0));
        }

        .cardBody {
          position: relative;
        }

        @media (max-width: 720px) {
          .adminCard {
            border-radius: 24px;
            padding: 20px;
          }
        }
      `}</style>
    </>
  );
}
