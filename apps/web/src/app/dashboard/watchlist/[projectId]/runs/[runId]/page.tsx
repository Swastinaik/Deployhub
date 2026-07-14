"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import authFetch from "@/app/lib/authFetch";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface WorkflowStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowJob {
  githubJobId: number;
  githubRunId: number;
  projectId: string;
  name: string;
  status: string;
  conclusion: string | null;
  runnerName: string | null;
  startedAt?: string;
  completedAt?: string;
  steps: WorkflowStep[];
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
  conclusion?: string | null;
}

interface JobsResponse {
  run: WorkflowRun;
  jobs: WorkflowJob[];
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
function conclusionBadgeClass(c?: string | null) {
  if (c === "success") return "badge badge-success";
  if (c === "failure") return "badge badge-failure";
  return "badge badge-neutral";
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

function formatDuration(s: number) {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function calculateDuration(start?: string, end?: string) {
  if (start && end) {
    const elapsed = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    return formatDuration(elapsed);
  }
  return "";
}

export default function WorkflowRunLogsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;
  const runId = params?.runId as string;

  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!projectId || !runId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authFetch(
          `/api/github/projects/${projectId}/runs/${runId}/jobs`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Server error ${res.status}`);
        }
        const json = await res.json();
        if (json.status === "success" && json.data) {
          setData(json.data);
          // Auto-expand all jobs by default on load
          const allJobIds = (json.data.jobs || []).map((j: WorkflowJob) => j.githubJobId);
          setExpandedJobs(new Set(allJobIds));
        } else {
          throw new Error(json.message || "Failed to load workflow run jobs");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, runId]);

  const toggleJob = (jobId: number) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      next.has(jobId) ? next.delete(jobId) : next.add(jobId);
      return next;
    });
  };

  const renderStatusIndicator = (status: string, conclusion?: string | null) => {
    const isRunning = status === "in_progress" || status === "running";
    const isQueued = status === "queued" || status === "requested" || status === "pending";

    if (isQueued) {
      return (
        <span className="status-badge queued" style={{ color: "var(--accent-brass)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span className="dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-brass)" }} />
          QUEUED
        </span>
      );
    }

    if (isRunning) {
      return (
        <span className="status-badge running" style={{ color: "var(--accent-brass)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span className="pulse-dot" style={{ background: "var(--accent-brass)" }} />
          IN_PROGRESS
        </span>
      );
    }

    if (status === "completed") {
      if (conclusion === "success") {
        return (
          <span className="status-badge success" style={{ color: "#2ECC71", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <span>✓</span> SUCCESS
          </span>
        );
      }
      if (conclusion === "failure") {
        return (
          <span className="status-badge failure" style={{ color: "var(--accent-vermillion)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
            <span>✕</span> FAILURE
          </span>
        );
      }
      return (
        <span className="status-badge neutral" style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span>⊘</span> {conclusion?.toUpperCase() || "COMPLETED"}
        </span>
      );
    }

    return (
      <span className="status-badge neutral" style={{ color: "var(--text-secondary)" }}>
        {status.toUpperCase()}
      </span>
    );
  };

  const run = data?.run;
  const jobs = data?.jobs || [];

  return (
    <main className="dashboard-main">
      {/* ── Header ── */}
      <header className="logs-page-header">
        <div className="logs-header-left">
          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span
              className="breadcrumb-link"
              onClick={() => router.push("/dashboard")}
            >
              Watchlist
            </span>
            <span className="breadcrumb-separator">/</span>
            <span
              className="breadcrumb-link"
              onClick={() => router.push(`/dashboard/watchlist/${projectId}`)}
            >
              {run?.workflowName ?? "Project"}
            </span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Run #{runId}</span>
          </div>

          {/* Run title */}
          <p className="logs-run-title" style={{ fontSize: "1.75rem", fontWeight: "700", marginTop: "0.5rem" }}>
            {run ? run.workflowName : "Workflow Execution"}
          </p>

          {/* Run metadata pills */}
          {run && (
            <div className="run-meta-row" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
              <span className={conclusionBadgeClass(run.conclusion)}>
                {run.conclusion ? run.conclusion.toUpperCase() : run.status.toUpperCase()}
              </span>

              <span className="run-meta-item">
                <code className="run-meta-branch">{run.branch}</code>
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label" style={{ color: "var(--text-secondary)", marginRight: "0.25rem" }}>sha:</span>
                {run.commitSha.substring(0, 7)}
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label" style={{ color: "var(--text-secondary)", marginRight: "0.25rem" }}>actor:</span>
                {run.actor}
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label" style={{ color: "var(--text-secondary)", marginRight: "0.25rem" }}>duration:</span>
                {formatDuration(run.durationSeconds)}
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label" style={{ color: "var(--text-secondary)", marginRight: "0.25rem" }}>started:</span>
                {formatDate(run.startedAt)}
              </span>
            </div>
          )}
        </div>

        <button
          className="back-button"
          onClick={() => router.push(`/dashboard/watchlist/${projectId}`)}
        >
          ← Back to Project
        </button>
      </header>

      {/* ── Content ── */}
      <div className="logs-content" style={{ marginTop: "2rem" }}>
        {error && (
          <div className="error-banner">
            <strong>TELEMETRY FETCH FAULT:</strong> {error}
          </div>
        )}

        {loading ? (
          <div className="loading-state" style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", padding: "4rem 0" }}>
            <div className="spinner" />
            <span>RETRIEVING JOBS AND STEPS EXECUTION HISTORY...</span>
          </div>
        ) : !data || jobs.length === 0 ? (
          <div className="empty-state" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
            NO EXECUTION TELEMETRY FOUND FOR THIS RUN YET.
            <span className="run-meta-label" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
              Jobs are collected during actions execution. Historical runs might lack job metadata.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Commit message banner */}
            {run?.commitMessage && (
              <div className="commit-banner" style={{ background: "var(--bg-paper-warm)", border: "1px solid var(--border-medium)", borderRadius: "6px", padding: "1rem", fontSize: "0.9rem" }}>
                <span className="commit-banner-label" style={{ color: "var(--accent-vermillion)", fontWeight: "600", marginRight: "0.5rem" }}>commit:</span>
                {run.commitMessage}
              </div>
            )}

            {/* Jobs Tree list */}
            <div className="jobs-list-container" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {jobs.map((job) => {
                const isOpen = expandedJobs.has(job.githubJobId);
                const durationText = calculateDuration(job.startedAt, job.completedAt);

                return (
                  <div
                    key={job.githubJobId}
                    className="portal-card"
                    style={{
                      background: "rgba(255,255,255,0.01)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Job Card Header */}
                    <button
                      onClick={() => toggleJob(job.githubJobId)}
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "1.25rem",
                        cursor: "pointer",
                        outline: "none",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.15s ease",
                          }}
                        >
                          ▶
                        </span>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)", fontSize: "1.1rem" }}>
                          🛠️ {job.name}
                        </span>
                        {job.runnerName && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)",
                              background: "rgba(255,255,255,0.05)",
                              borderRadius: "4px",
                              padding: "0.1rem 0.4rem",
                            }}
                          >
                            runner: {job.runnerName}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                        {durationText && (
                          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            ⏱️ {durationText}
                          </span>
                        )}
                        {renderStatusIndicator(job.status, job.conclusion)}
                      </div>
                    </button>

                    {/* Collapsible Steps list */}
                    {isOpen && (
                      <div
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                          padding: "1rem 1.5rem 1.5rem 1.5rem",
                          background: "rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        {job.steps && job.steps.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.6rem",
                              paddingLeft: "1rem",
                              borderLeft: "2px solid rgba(255,255,255,0.05)",
                            }}
                          >
                            {job.steps.map((step) => {
                              const stepDuration = calculateDuration(step.startedAt, step.completedAt);

                              return (
                                <div
                                  key={step.number}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "0.9rem",
                                    padding: "0.4rem 0",
                                  }}
                                >
                                  <span style={{ color: "var(--text-secondary)", display: "flex", gap: "0.5rem" }}>
                                    <span style={{ color: "var(--accent-vermillion)", opacity: "0.7" }}>{step.number}.</span>
                                    {step.name}
                                  </span>

                                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                    {stepDuration && (
                                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                                        {stepDuration}
                                      </span>
                                    )}
                                    {renderStatusIndicator(step.status, step.conclusion)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", fontStyle: "italic" }}>
                            No step metadata recorded for this job.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
