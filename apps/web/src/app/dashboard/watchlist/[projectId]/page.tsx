"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import authFetch from "@/app/lib/authFetch";
import { gql } from "@apollo/client";
import { apolloClient } from "@/lib/apollo-client";

/* ── GraphQL Metrics Query ── */
const GET_PROJECT_METRICS = gql`
  query GetProjectMetrics($projectId: ID!) {
    projectMetrics(projectId: $projectId) {
      totalRuns
      successfulRuns
      failedRuns
      activeRuns
      successRate
      averageDuration
    }
  }
`;

/* ── Interfaces ── */
interface RepositoryDetails {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface WorkflowRun {
  githubRunId: number;
  workflowName: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  actor: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds: number;
  status: string;
  conclusion?: string;
}

interface ProjectData {
  id: string;
  name: string;
  githubRepoOwner: string;
  githubRepoName: string;
  defaultBranch: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  repoResponse: RepositoryDetails;
  recentWorkflowRuns: WorkflowRun[];
}

interface LogLine {
  _id?: string;
  workflowRunId: number;
  stepName: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: string;
}

interface ProjectMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  activeRuns: number;
  successRate: number;
  averageDuration: number;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);
  const [activeRuns, setActiveRuns] = useState<WorkflowRun[]>([]);
  const [selectedActiveRunId, setSelectedActiveRunId] = useState<number | null>(null);
  const [activeLogs, setActiveLogs] = useState<Record<number, LogLine[]>>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Live timer tick trigger
  const [, setTimerTick] = useState<number>(0);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Auto-scroll logs to bottom when new logs are rendered
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeLogs, selectedActiveRunId]);

  // Fetch project details and initial metrics on mount
  useEffect(() => {
    if (!projectId) return;

    const fetchProjectDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await authFetch(`/api/github/projects/${projectId}`, {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error(`Server returned status: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === "success" && result.data) {
          setProject(result.data);

          // Sync initial active runs (running or queued)
          const active = result.data.recentWorkflowRuns.filter(
            (run: WorkflowRun) => run.status === "in_progress" || run.status === "queued"
          );
          setActiveRuns(active);

          // Select the first active run as default selected
          if (active.length > 0) {
            setSelectedActiveRunId(active[0].githubRunId);
          }
        } else {
          throw new Error(result.message || "Failed to load project details");
        }
      } catch (err: any) {
        console.error("[ProjectDetail] Error loading project:", err.message);
        setError(err.message || "An error occurred while loading project details.");
      } finally {
        setLoading(false);
      }
    };

    const fetchMetrics = async () => {
      try {
        setMetricsLoading(true);
        const { data } = await apolloClient.query<{ projectMetrics: ProjectMetrics }, { projectId: string }>({
          query: GET_PROJECT_METRICS,
          variables: { projectId },
          fetchPolicy: "network-only",
        });
        if (data && data.projectMetrics) {
          setMetrics(data.projectMetrics);
        }
      } catch (err: any) {
        console.error("[ProjectDetail] Error loading metrics via GraphQL:", err.message);
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchProjectDetails();
    fetchMetrics();
  }, [projectId]);

  // Synchronize selection with active builds list
  useEffect(() => {
    const activeIds = activeRuns.map((r) => r.githubRunId);
    if (selectedActiveRunId === null || !activeIds.includes(selectedActiveRunId)) {
      if (activeRuns.length > 0) {
        setSelectedActiveRunId(activeRuns[0].githubRunId);
      } else {
        setSelectedActiveRunId(null);
      }
    }
  }, [activeRuns, selectedActiveRunId]);

  // Connect to WebSockets and join the project room
  useEffect(() => {
    if (!projectId) return;

    const socket = io(process.env.NEXT_PUBLIC_API_URL || "", {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("join_project", projectId);

      // Trigger workflow sync/watching in the backend
      authFetch("/api/workflow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
      }).catch((err) => {
        console.error("[ProjectDetail] Failed to trigger watching service:", err);
      });
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    // Listen for workflow run updates
    socket.on("workflow_synced", (workflow: WorkflowRun) => {
      // 1. Maintain active runs lifecycle
      setActiveRuns((prevActive) => {
        const isActive = workflow.status === "in_progress" || workflow.status === "queued";
        const exists = prevActive.some((r) => r.githubRunId === workflow.githubRunId);

        if (isActive) {
          if (exists) {
            return prevActive.map((r) => (r.githubRunId === workflow.githubRunId ? workflow : r));
          } else {
            return [...prevActive, workflow];
          }
        } else {
          return prevActive.filter((r) => r.githubRunId !== workflow.githubRunId);
        }
      });

      // 2. Sync project recent run list
      setProject((prev) => {
        if (!prev) return null;
        const exists = prev.recentWorkflowRuns.some((r) => r.githubRunId === workflow.githubRunId);
        let updatedRuns = [...prev.recentWorkflowRuns];
        if (exists) {
          updatedRuns = updatedRuns.map((r) => (r.githubRunId === workflow.githubRunId ? workflow : r));
        } else {
          updatedRuns.unshift(workflow);
        }
        return {
          ...prev,
          recentWorkflowRuns: updatedRuns.slice(0, 5),
        };
      });
    });

    // Listen for logs
    socket.on("workflow_logs", (newLogs: LogLine[]) => {
      setActiveLogs((prev) => {
        const next = { ...prev };
        for (const line of newLogs) {
          const runId = line.workflowRunId;
          if (!next[runId]) {
            next[runId] = [];
          }
          next[runId] = [...next[runId], line];
        }
        return next;
      });
    });

    return () => {
      socket.emit("leave_project", projectId);
      socket.off("connect");
      socket.off("disconnect");
      socket.off("workflow_synced");
      socket.off("workflow_logs");
      socket.disconnect();
    };
  }, [projectId]);

  // Live timer tick for active builds
  useEffect(() => {
    const hasRunningBuild = activeRuns.some((r) => r.status === "in_progress");
    if (!hasRunningBuild) return;

    const interval = setInterval(() => {
      setTimerTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRuns]);

  /* ── Formatters ── */
  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (s: number) => {
    if (!s && s !== 0) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const getRunDuration = (run: WorkflowRun) => {
    if (run.status === "in_progress") {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000));
      return formatDuration(elapsed);
    }
    return formatDuration(run.durationSeconds);
  };

  /* ── Skeleton Loaders ── */
  if (loading) {
    return (
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="header-title-container">
            <div className="skeleton-line medium" style={{ height: "1.5rem", marginBottom: "0.5rem" }} />
            <div className="skeleton-line long" style={{ height: "2.5rem" }} />
          </div>
        </header>
        <div className="dashboard-content dashboard-content-flex">
          {/* Metrics skeleton */}
          <div className="metrics-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="portal-card metric-card skeleton-card">
                <div className="skeleton-line short" />
                <div className="skeleton-line medium" style={{ height: "2rem", margin: "0.5rem 0" }} />
                <div className="skeleton-line short" />
              </div>
            ))}
          </div>

          {/* Active Builds & Log split skeleton */}
          <div className="active-telemetry-grid">
            <div className="portal-card telemetry-card">
              <div className="terminal-header" style={{ marginBottom: "1rem" }}>
                <div className="skeleton-line short" style={{ height: "1.2rem", width: "150px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="active-build-card skeleton-card">
                  <div className="skeleton-line long" style={{ height: "1.2rem" }} />
                  <div className="skeleton-line medium" style={{ height: "1rem", margin: "0.5rem 0" }} />
                  <div className="skeleton-line short" />
                </div>
              </div>
            </div>

            <div className="portal-card telemetry-card">
              <div className="terminal-header" style={{ marginBottom: "1rem" }}>
                <div className="skeleton-line short" style={{ height: "1.2rem", width: "150px" }} />
              </div>
              <div className="terminal-window" style={{ height: "400px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
                  <div className="skeleton-line long" style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }} />
                  <div className="skeleton-line medium" style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }} />
                  <div className="skeleton-line long" style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Table skeleton at bottom */}
          <div className="portal-card telemetry-card">
            <div className="terminal-header" style={{ marginBottom: "1rem" }}>
              <div className="skeleton-line short" style={{ height: "1.2rem", width: "200px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton-line long" style={{ height: "2rem" }} />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const recentRuns = project?.recentWorkflowRuns || [];
  const selectedActiveRun = activeRuns.find((r) => r.githubRunId === selectedActiveRunId);
  const displayedLogs = selectedActiveRunId !== null ? activeLogs[selectedActiveRunId] || [] : [];

  return (
    <main className="dashboard-main">
      {/* ── Repository Header ── */}
      {project && (
        <header className="dashboard-header">
          <div className="header-title-container">
            <div className="breadcrumb">
              <span className="breadcrumb-link" onClick={() => router.push("/dashboard/watchlist")}>
                Watchlist
              </span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">{project.githubRepoName}</span>
            </div>
            <h2 className="dashboard-title project-title">
              {project.githubRepoOwner}
              <span style={{ color: "var(--accent-vermillion)" }}>/</span>
              {project.githubRepoName}
            </h2>
            <div className="sync-time" style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Last synced: {project.updatedAt ? formatDate(project.updatedAt) : "—"}
            </div>
          </div>
          <div className="project-meta-container" style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className={`badge ${project.visibility === "PRIVATE" ? "private" : "public"}`}>
              {project.visibility}
            </span>
            <span className="badge" style={{ background: "var(--bg-paper-warm)", color: "var(--text-primary)", border: "1px solid var(--border-medium)" }}>
              {project.defaultBranch}
            </span>
            <div className="socket-status stream-status">
              <span className={`status-dot ${socketConnected ? "active" : "inactive"}`} />
              {socketConnected ? "CONNECTED" : "DISCONNECTED"}
            </div>
            {project.repoResponse?.html_url && (
              <a
                href={project.repoResponse.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="github-auth-button"
                style={{ fontSize: "0.75rem", padding: "0.4rem 0.8rem", width: "auto", margin: 0 }}
              >
                <span>GitHub Repo ↗</span>
              </a>
            )}
          </div>
        </header>
      )}

      {error && (
        <div style={{ padding: "0 3rem" }}>
          <div className="error-banner">
            <strong>TELEMETRY FAULT:</strong> {error}
          </div>
        </div>
      )}

      <div className="dashboard-content dashboard-content-flex">
        {/* ── Metrics Overview Section ── */}
        <div className="metrics-grid">
          {metricsLoading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="portal-card metric-card skeleton-card" style={{ height: "120px" }}>
                <div className="skeleton-line short" />
                <div className="skeleton-line medium" style={{ height: "2rem", margin: "0.5rem 0" }} />
                <div className="skeleton-line short" />
              </div>
            ))
          ) : (
            <>
              {/* Total Runs */}
              <div className="portal-card metric-card">
                <span className="metric-label">Total Runs</span>
                <h3 className="metric-value">{metrics?.totalRuns ?? 0}</h3>
                <div className="metric-footer">
                  <span className="metric-indicator neutral">All workflows</span>
                </div>
              </div>

              {/* Successful Runs */}
              <div className="portal-card metric-card">
                <span className="metric-label">Successful Runs</span>
                <h3 className="metric-value" style={{ color: "#2ECC71" }}>{metrics?.successfulRuns ?? 0}</h3>
                <div className="metric-footer">
                  <span className="metric-indicator success">✓ Passed</span>
                </div>
              </div>

              {/* Failed Runs */}
              <div className="portal-card metric-card">
                <span className="metric-label">Failed Runs</span>
                <h3 className="metric-value" style={{ color: "var(--accent-vermillion)" }}>{metrics?.failedRuns ?? 0}</h3>
                <div className="metric-footer">
                  <span className="metric-indicator error">✕ Failed</span>
                </div>
              </div>

              {/* Active Runs */}
              <div className="portal-card metric-card">
                <span className="metric-label">Active Runs</span>
                <h3 className="metric-value" style={{ color: "var(--accent-brass)" }}>{metrics?.activeRuns ?? 0}</h3>
                <div className="metric-footer">
                  <span className="metric-indicator" style={{ color: "var(--accent-brass)" }}>
                    <span className="pulse-dot" style={{ display: "inline-block", marginRight: "4px" }} />
                    Running
                  </span>
                </div>
              </div>

              {/* Success Rate */}
              <div className="portal-card metric-card">
                <span className="metric-label">Success Rate</span>
                <h3 className="metric-value">
                  {metrics ? `${metrics.successRate.toFixed(1)}%` : "0.0%"}
                </h3>
                <div className="metric-footer">
                  <span className={`metric-indicator ${metrics && metrics.successRate >= 80 ? "success" : "error"}`}>
                    {metrics && metrics.successRate >= 80 ? "Healthy" : "Needs Attention"}
                  </span>
                </div>
              </div>

              {/* Average Duration */}
              <div className="portal-card metric-card">
                <span className="metric-label">Average Duration</span>
                <h3 className="metric-value">
                  {metrics ? formatDuration(metrics.averageDuration) : "—"}
                </h3>
                <div className="metric-footer">
                  <span className="metric-indicator neutral">Mean run time</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Active Builds & Live Log Split Section (50%/50%) ── */}
        <div className="active-telemetry-grid">
          {/* Active Builds Selection List */}
          <div className="portal-card telemetry-card">
            <div className="section-title">Active Builds</div>
            {activeRuns.length === 0 ? (
              <div className="empty-active-builds">No active deployments</div>
            ) : (
              <div className="active-builds-scroll-container">
                {activeRuns.map((run) => {
                  const isSelected = selectedActiveRunId === run.githubRunId;
                  const started = new Date(run.startedAt).getTime();
                  const durationSec = run.status === "in_progress"
                    ? Math.max(0, Math.floor((Date.now() - started) / 1000))
                    : run.durationSeconds || 0;

                  return (
                    <div
                      key={run.githubRunId}
                      className={`active-build-card active-build-card-clickable ${isSelected ? "selected-active-build-card" : ""}`}
                      onClick={() => setSelectedActiveRunId(run.githubRunId)}
                    >
                      <div className="active-build-header">
                        <div>
                          <span className="active-build-name">{run.workflowName}</span>
                          <span className="active-build-number">#{run.githubRunId}</span>
                        </div>
                        <span className={`status-badge ${run.status}`}>
                          {run.status === "in_progress" && <span className="pulse-dot" />}
                          {run.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="active-build-details">
                        <div className="detail-row">
                          <span className="metadata-label">Branch</span>
                          <code>{run.branch}</code>
                        </div>
                        <div className="detail-row">
                          <span className="metadata-label">Started</span>
                          <span>{formatDate(run.startedAt)}</span>
                        </div>
                        <div className="detail-row">
                          <span className="metadata-label">Duration</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: "600" }}>
                            {formatDuration(durationSec)}
                          </span>
                        </div>
                        <div className="detail-row">
                          <span className="metadata-label">Actor</span>
                          <span>{run.actor}</span>
                        </div>
                      </div>

                      <div className="active-build-commit">
                        <span className="commit-sha-badge">{run.commitSha.substring(0, 7)}</span>
                        <span className="commit-msg-text" title={run.commitMessage}>
                          {run.commitMessage}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Active Build Live Console Stream */}
          <div className="portal-card telemetry-card">
            <div className="terminal-header">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <h3 className="terminal-title">
                  [LIVE_LOGS] {selectedActiveRun ? `(Run #${selectedActiveRun.githubRunId})` : ""}
                </h3>
                {selectedActiveRun && (
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", gap: "0.75rem" }}>
                    <span>
                      branch: <code>{selectedActiveRun.branch}</code>
                    </span>
                    <span>
                      status: <code>{selectedActiveRun.status.toUpperCase()}</code>
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="terminal-window" style={{ height: "450px" }}>
              {activeRuns.length === 0 ? (
                <div className="terminal-empty">
                  <span className="terminal-cursor">&gt;_</span>
                  <span>No active builds running</span>
                </div>
              ) : !selectedActiveRunId ? (
                <div className="terminal-empty">
                  <span className="terminal-cursor">&gt;_</span>
                  <span>Select an active build to view console stream</span>
                </div>
              ) : displayedLogs.length === 0 ? (
                <div className="terminal-empty">
                  <span className="terminal-cursor">&gt;_</span>
                  <span>No logs captured for this active run yet</span>
                </div>
              ) : (
                displayedLogs.map((line, idx) => (
                  <div key={line._id || idx} className="log-line animate-reveal-item">
                    <span className="log-timestamp">[{formatTime(line.timestamp)}]</span>
                    <span className={`log-badge-level ${line.level.toLowerCase()}`}>
                      {line.level.toUpperCase()}
                    </span>
                    {line.stepName && <span className="log-badge-step">[{line.stepName}]</span>}
                    <span className={`log-message ${line.level.toLowerCase()}`}>
                      {line.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* ── Recent Runs Table Section (Full Width) ── */}
        {recentRuns.length === 0 ? (
          <div className="empty-state-container">
            <p className="empty-state-text">Repository has no workflow runs yet</p>
          </div>
        ) : (
          <div className="portal-card telemetry-card">
            <div className="terminal-header" style={{ marginBottom: "1rem" }}>
              <h3 className="terminal-title">[RECENT_WORKFLOW_RUNS]</h3>
            </div>
            <div className="runs-table-container">
              <table className="runs-table">
                <thead>
                  <tr className="runs-table-header-row">
                    <th className="runs-table-th">Workflow</th>
                    <th className="runs-table-th">Branch</th>
                    <th className="runs-table-th">Status</th>
                    <th className="runs-table-th">Duration</th>
                    <th className="runs-table-th">Commit</th>
                    <th className="runs-table-th">Actor</th>
                    <th className="runs-table-th">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => {
                    const isSuccess = run.conclusion === "success";
                    const isFailure = run.conclusion === "failure";
                    const isCancelled = run.conclusion === "cancelled";
                    const isRunning = run.status === "in_progress" || run.status === "queued";

                    let badgeClass = "badge-neutral";
                    if (isSuccess) badgeClass = "badge-success";
                    if (isFailure) badgeClass = "badge-failure";
                    if (isCancelled) badgeClass = "badge-neutral";
                    if (isRunning) badgeClass = "badge-neutral";

                    return (
                      <tr
                        key={run.githubRunId}
                        className="runs-row runs-row-clickable"
                        onClick={() => router.push(`/dashboard/watchlist/${projectId}/runs/${run.githubRunId}`)}
                        title="Click to view run history logs"
                      >
                        <td className="runs-cell bold">{run.workflowName}</td>
                        <td className="runs-cell">
                          <code className="run-meta-branch">{run.branch}</code>
                        </td>
                        <td className="runs-cell">
                          {isRunning ? (
                            <span
                              className="badge"
                              style={{
                                backgroundColor: "var(--accent-brass-dim)",
                                color: "var(--accent-brass)",
                                border: "1px solid var(--accent-brass)",
                              }}
                            >
                              RUNNING
                            </span>
                          ) : (
                            <span className={`badge ${badgeClass}`}>
                              {(run.conclusion || run.status).toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="runs-cell">
                          {isRunning ? (
                            <span style={{ fontWeight: "600" }}>
                              {getRunDuration(run)}
                            </span>
                          ) : (
                            getRunDuration(run)
                          )}
                        </td>
                        <td className="runs-cell runs-cell-truncate">
                          <span className="commit-sha" style={{ color: "var(--accent-vermillion)", marginRight: "0.5rem" }}>
                            {run.commitSha.substring(0, 7)}
                          </span>
                          <span className="commit-msg">{run.commitMessage}</span>
                        </td>
                        <td className="runs-cell">
                          <div className="actor-avatar-container">
                            <span className="actor-avatar">
                              {run.actor.charAt(0).toUpperCase()}
                            </span>
                            {run.actor}
                          </div>
                        </td>
                        <td className="runs-cell runs-muted">{formatDate(run.startedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
