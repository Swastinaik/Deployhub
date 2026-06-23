"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import authFetch from "@/app/lib/authFetch";

export default function WatchlistPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authFetch("/api/github/projects", {
        method: "GET",
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === "success" && Array.isArray(result.data)) {
          setProjects(result.data);
        } else {
          throw new Error(result.message || "Failed to retrieve watchlist.");
        }
      } else {
        throw new Error(`Server returned status: ${response.status}`);
      }
    } catch (err: any) {
      console.error("[Watchlist] Error fetching projects:", err.message);
      setError(err.message || "An unexpected error occurred while loading the watchlist.");
    } finally {
      setLoading(false);
    }
  };

  const handleViewProject = (projectId: string) => {
    router.push(`/dashboard/${projectId}`);
  };

  return (
    <main className="dashboard-main animate-reveal-item delay-2">
      <header className="dashboard-header">
        <div className="header-title-container">
          <h2 className="dashboard-title">Watchlist</h2>
          <p className="dashboard-subtitle">
            Monitor your starred repositories and active deployments.
          </p>
        </div>
      </header>

      <div className="dashboard-content">
        {error && (
          <div className="error-banner">
            <strong>SYSTEM FAULT:</strong> {error}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>LOADING WATCHLIST...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state" style={{ marginTop: '2rem' }}>
            YOUR WATCHLIST IS CURRENTLY EMPTY. CONNECT A REPOSITORY TO WATCH IT.
          </div>
        ) : (
          <div className="repos-grid">
            {projects.map((project) => (
              <div key={project.id} className="repo-card">
                <div className="repo-content">
                  <div className="repo-header">
                    <h3 className="repo-name">
                      <span className="repo-owner">{project.githubRepoOwner}</span>
                      <span className="repo-separator">/</span>
                      {project.githubRepoName}
                    </h3>
                    <div className="repo-badges">
                      <span className={`badge ${project.visibility === 'PRIVATE' ? 'private' : 'public'}`}>
                        {project.visibility}
                      </span>
                    </div>
                  </div>
                  <p className="repo-description" style={{ fontSize: '0.85rem' }}>
                    Default branch: <code style={{ color: 'var(--accent-brass)' }}>{project.defaultBranch}</code>
                  </p>
                  <div className="repo-meta">
                    <span className="meta-item">
                      Joined: {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="repo-action">
                  <button
                    onClick={() => handleViewProject(project.id)}
                    className="connect-btn"
                    style={{ background: 'var(--accent-vermillion)', borderColor: 'var(--accent-vermillion)', color: 'var(--bg-paper)' }}
                  >
                    <span className="btn-text">Dashboard ↗</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
