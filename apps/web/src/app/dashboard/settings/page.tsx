"use client";

import React from "react";

export default function SettingsPage() {
  return (
    <main className="dashboard-main animate-reveal-item delay-2">
      <header className="dashboard-header">
        <div className="header-title-container">
          <h2 className="dashboard-title">Settings</h2>
          <p className="dashboard-subtitle">
            Manage your account and platform preferences.
          </p>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          SETTINGS MODULE UNDER CONSTRUCTION.
        </div>
      </div>
    </main>
  );
}
