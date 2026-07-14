"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import authFetch from "@/app/lib/authFetch";

interface Repository {
  id: string;
  github_repo_id: number;
  repo_name: string;
  repo_full_name: string;
  installation_id: number;
  is_active: boolean;
}

const GITHUB_APP_INSTALLATION_URL = process.env.GITHUB_APP_INSTALLATION_URL || "https://github.com/apps/deployhub-local/installations/new"; // TODO: Replace with actual App Slug

export default function DashboardPage() {
  const router = useRouter();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>("Loading your dashboard...");
  const [showSpinner, setShowSpinner] = useState<boolean>(false);
  const [showFallback, setShowFallback] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const installationId = queryParams.get("installation_id") || queryParams.get("installationId");
    if (installationId) {
      checkInstallationStatus(installationId);
    } else {
      loadUserRepositories();
    }
  }, []);

  const checkInstallationStatus = async (installationId: string) => {
    // 1. Show a loading state to the user
    setLoading(true);
    setShowSpinner(true);
    setLoadingMessage("Your github reposistories is syncing");

    const maxAttempts = 5;
    let attempts = 0;
    let isSynced = false;

    // 2. Poll the backend because webhooks are asynchronous
    while (attempts < maxAttempts && !isSynced) {
      try {
        const response = await authFetch(`/api/github/verify-installation?installation_id=${installationId}`);
        if (response.ok) {
          const data = await response.json();

          if (data.status === "ready") {
            isSynced = true;
            setShowSpinner(false);
            setLoading(false);

            // 3. Success! Load the repositories into the UI layout
            setRepositories(data.repositories);
            return;
          }
        }
      } catch (err) {
        console.error("Error verifying installation sync:", err);
      }

      // Wait 2 seconds before checking again
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 4. Edge Case: If it takes too long, don't leave them spinning forever
    setShowSpinner(false);
    setLoading(false);
    setShowFallback(true); // Show a manual "Refresh Repositories" button
  };

  const loadUserRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch("/api/github/projects");
      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }
      const result = await response.json();
      if (result.status === "success" && Array.isArray(result.data)) {
        setRepositories(result.data);
      } else {
        throw new Error(result.message || "Failed to retrieve projects");
      }
      setShowFallback(false);
    } catch (err: any) {
      console.error("[Dashboard] Error loading repositories:", err.message);
      setError("Could not load your code tracking dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewProject = (projectId: string) => {
    router.push(`/dashboard/watchlist/${projectId}`);
  };

  return (
    <main className="dashboard-main animate-reveal-item delay-2">
      <header className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="header-title-container">
          <h2 className="dashboard-title">Orchestration Center</h2>
          <p className="dashboard-subtitle">
            Select and connect active GitHub repositories to provision isolated container runtimes.
          </p>
        </div>
        <a
          href={GITHUB_APP_INSTALLATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="connect-btn"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Connect with GitHub
        </a>
      </header>

      <div className="dashboard-content">
        {error && (
          <div className="error-banner">
            <strong>SYSTEM FAULT:</strong> {error}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            {showSpinner && <div className="spinner" />}
            <span>{loadingMessage}</span>
          </div>
        ) : (
          <>
            {showFallback && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", marginTop: "2rem", marginBottom: "2rem" }}>
                <p className="dashboard-subtitle" style={{ textAlign: "center" }}>
                  We couldn't confirm your GitHub App installation sync. You can try refreshing manually.
                </p>
                <button onClick={loadUserRepositories} className="connect-btn">
                  Refresh Repositories
                </button>
              </div>
            )}

            <div className="repos-grid">
              {repositories.length === 0 ? (
                <div className="empty-state">
                  NO ACTIVE REPOSITORIES FOUND ON THIS GITHUB INSTANCE.
                </div>
              ) : (
                repositories.map((repo) => {
                  return (
                    <div key={repo.id} className="repo-card">
                      <div className="repo-content">
                        <div className="repo-header">
                          <h3 className="repo-name">
                            {repo.repo_full_name}
                          </h3>
                          <div className="repo-badges">
                            {repo.is_active ? (
                              <span className="badge public">Active</span>
                            ) : (
                              <span className="badge private">Inactive</span>
                            )}
                          </div>
                        </div>
                        <p className="repo-description" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                          GitHub Repository ID: {repo.github_repo_id}
                        </p>
                      </div>

                      <div className="repo-action">
                        <button
                          onClick={() => handleViewProject(repo.id)}
                          className="connect-btn"
                          style={{ background: "var(--accent-vermillion)", borderColor: "var(--accent-vermillion)", color: "var(--bg-paper)" }}
                        >
                          <span className="btn-text">Dashboard ↗</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
