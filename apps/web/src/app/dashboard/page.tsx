"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import authFetch from "@/app/lib/authFetch";

interface Repository {
  id: number;
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  private: boolean;
  owner: {
    login: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tracks active connection requests (by owner/repo combination)
  const [connectingMap, setConnectingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchRepositories();
    fetchProjects();
  }, []);

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await authFetch("/api/github/repos", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === "success" && Array.isArray(result.data)) {
        setRepos(result.data);
      } else {
        throw new Error(result.message || "Failed to retrieve repositories");
      }
    } catch (err: any) {
      console.error("[Dashboard] Error fetching repositories:", err.message);
      setError(err.message || "An unexpected error occurred while loading repositories.");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      setProjectsLoading(true);
      const response = await authFetch("/api/github/projects", {
        method: "GET",
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === "success" && Array.isArray(result.data)) {
          setProjects(result.data);
        }
      }
    } catch (err: any) {
      console.error("[Dashboard] Error fetching projects:", err.message);
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleConnect = async (owner: string, repo: string) => {
    const key = `${owner}/${repo}`;
    try {
      setConnectingMap((prev) => ({ ...prev, [key]: true }));
      setError(null);

      const response = await authFetch("/api/github/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner, repo }),
      });

      const result = await response.json();

      if (response.ok && result.status === "success") {
        await fetchProjects();
      } else {
        throw new Error(result.message || "Could not complete registration.");
      }
    } catch (err: any) {
      console.error("[Dashboard] Connection failed:", err.message);
      setError(`Failed to connect ${owner}/${repo}: ${err.message}`);
    } finally {
      setConnectingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleViewProject = (projectId: string) => {
    router.push(`/dashboard/watchlist/${projectId}`);
  };

  return (
    <main className="dashboard-main animate-reveal-item delay-2">
      <header className="dashboard-header">
        <div className="header-title-container">
          <h2 className="dashboard-title">Orchestration Center</h2>
          <p className="dashboard-subtitle">
            Select and connect active GitHub repositories to provision isolated container runtimes.
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
            <span>FETCHING REGISTRIES...</span>
          </div>
        ) : (
          <div className="repos-grid">
            {repos.length === 0 ? (
              <div className="empty-state">
                NO ACTIVE REPOSITORIES FOUND ON THIS GITHUB INSTANCE.
              </div>
            ) : (
              repos.map((repo) => {
                const key = `${repo.owner.login}/${repo.name}`;
                const project = projects.find(p => p.githubRepoId === String(repo.id));
                const isConnected = !!project;
                const isConnecting = !!connectingMap[key];

                return (
                  <div key={repo.id} className="repo-card">
                    <div className="repo-content">
                      <div className="repo-header">
                        <h3 className="repo-name">
                          <span className="repo-owner">{repo.owner.login}</span>
                          <span className="repo-separator">/</span>
                          {repo.name}
                        </h3>
                        <div className="repo-badges">
                          {repo.private ? (
                            <span className="badge private">Private</span>
                          ) : (
                            <span className="badge public">Public</span>
                          )}
                        </div>
                      </div>

                      {repo.description && (
                        <p className="repo-description">{repo.description}</p>
                      )}

                      <div className="repo-meta">
                        {repo.language && (
                          <span className="meta-item">
                            <span className="lang-dot"></span>
                            {repo.language}
                          </span>
                        )}
                        <span className="meta-item">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px" }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                          {repo.stargazers_count}
                        </span>
                      </div>
                    </div>

                    <div className="repo-action">
                      {isConnected ? (
                        <button
                          onClick={() => handleViewProject(project.id)}
                          className="connect-btn"
                          style={{ background: 'var(--accent-vermillion)', borderColor: 'var(--accent-vermillion)', color: 'var(--bg-paper)' }}
                        >
                          <span className="btn-text">Dashboard ↗</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(repo.owner.login, repo.name)}
                          disabled={isConnecting}
                          className={`connect-btn ${isConnecting ? 'connecting' : ''}`}
                        >
                          <span className="btn-text">
                            {isConnecting ? "Connecting..." : "Connect"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </main>
  );
}
