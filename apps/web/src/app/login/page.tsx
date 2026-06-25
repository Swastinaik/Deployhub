"use client";

import React from "react";

export default function LoginPage() {
  return (
    <main className="portal-container animate-fade-in" id="portal_root">
      {/* Brand header with staggered entrance animation */}
      <header className="brand-signature animate-reveal-item delay-1" id="brand_header">
        <div className="brand-icon-wrapper" id="brand_logo_container">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: "24px", height: "24px" }}
            id="brand_logo_svg"
          >
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
        <h1 className="brand-title" id="brand_title_text">
          Deploy<span>Hub</span>
        </h1>
      </header>

      {/* Editorial brutalist portal card */}
      <section className="portal-card animate-reveal-item delay-2" id="portal_login_card">
        <header className="portal-card-header" id="portal_card_header">
          <h2 className="portal-card-title" id="portal_card_title_text">Control Center</h2>
          <p className="portal-card-subtitle" id="portal_card_subtitle_text">
            Authenticate via GitHub to access cluster orchestration, edge deployments, and network controls.
          </p>
        </header>

        {/* Brutalist GitHub Auth Button with slide-in hover */}
        <a
          href={process.env.NEXT_PUBLIC_API_URL + "/auth/github"}
          className="github-auth-button animate-reveal-item delay-3"
          rel="noopener noreferrer"
          id="github_login_button"
        >
          <svg className="github-icon-svg" viewBox="0 0 24 24" aria-hidden="true" id="github_icon_svg">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span id="github_button_label">Continue with GitHub</span>
        </a>

        {/* Minimal footer */}
        <footer className="portal-card-footer animate-reveal-item delay-4" id="portal_card_footer">
          <p id="portal_footer_text">
            <a href="#" target="_blank" rel="noopener noreferrer" id="tos_link">Terms of Service</a>
            <span className="divider" id="portal_footer_divider">/</span>
            <a href="#" target="_blank" rel="noopener noreferrer" id="security_policy_link">Security Policy</a>
          </p>
        </footer>
      </section>
    </main>
  );
}
