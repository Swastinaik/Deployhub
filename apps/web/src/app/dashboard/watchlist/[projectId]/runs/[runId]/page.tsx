"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import authFetch from "@/app/lib/authFetch";

/* ── Types ─────────────────────────────────────────────────────────────── */
interface LogLine {
  _id: string;
  workflowRunId: number;
  stepName: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: string;
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

interface LogsResponse {
  run: WorkflowRun;
  logs: LogLine[];
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
function conclusionBadgeClass(c?: string | null) {
  if (c === "success") return "badge badge-success";
  if (c === "failure") return "badge badge-failure";
  return "badge badge-neutral";
}

function formatTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/* ── Group logs by step name ───────────────────────────────────────────── */
interface StepGroup {
  stepName: string;
  lines: LogLine[];
  hasError: boolean;
  hasWarning: boolean;
}

function groupByStep(logs: LogLine[]): StepGroup[] {
  const map = new Map<string, StepGroup>();
  for (const line of logs) {
    const key = line.stepName || "General";
    if (!map.has(key)) {
      map.set(key, { stepName: key, lines: [], hasError: false, hasWarning: false });
    }
    const group = map.get(key)!;
    group.lines.push(line);
    if (line.level === "error") group.hasError = true;
    if (line.level === "warning") group.hasWarning = true;
  }
  return Array.from(map.values());
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function WorkflowRunLogsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;
  const runId = params?.runId as string;

  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId || !runId) return;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authFetch(
          `/api/github/projects/${projectId}/runs/${runId}/logs`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Server error ${res.status}`);
        }
        const json = await res.json();
        if (json.status === "success") {
          setData(json.data);
          // Auto-expand all steps on load
          const steps = groupByStep(json.data.logs).map((g) => g.stepName);
          setOpenSteps(new Set(steps));
        } else {
          throw new Error(json.message || "Failed to load logs");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, runId]);

  const toggleStep = (name: string) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const stepGroups = data ? groupByStep(data.logs) : [];
  const run = data?.run;

  return (
    <main className="dashboard-main">
      {/* ── Header ── */}
      <header className="logs-page-header">
        <div className="logs-header-left">
          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span
              className="breadcrumb-link"
              onClick={() => router.push("/dashboard?tab=watchlist")}
            >
              Watchlist
            </span>
            <span className="breadcrumb-separator">/</span>
            <span
              className="breadcrumb-link"
              onClick={() => router.push(`/dashboard/${projectId}`)}
            >
              {run?.workflowName ?? "Project"}
            </span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Run #{runId}</span>
          </div>

          {/* Run title */}
          <p className="logs-run-title">
            {run ? run.workflowName : "Workflow Logs"}
          </p>

          {/* Run metadata pills */}
          {run && (
            <div className="run-meta-row">
              <span className={conclusionBadgeClass(run.conclusion)}>
                {run.conclusion ? run.conclusion.toUpperCase() : run.status.toUpperCase()}
              </span>

              <span className="run-meta-item">
                <code className="run-meta-branch">{run.branch}</code>
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label">sha:</span>
                {run.commitSha.substring(0, 7)}
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label">actor:</span>
                {run.actor}
              </span>

              <span className="run-meta-item">
                <span className="run-meta-label">duration:</span>
                {formatDuration(run.durationSeconds)}
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
      <div className="logs-content">
        {error && (
          <div className="error-banner">
            <strong>LOG FETCH ERROR:</strong> {error}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>FETCHING TELEMETRY LOGS FROM DATASTORE...</span>
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="empty-state">
            NO LOG LINES STORED FOR THIS RUN YET.{" "}
            <span className="run-meta-label">
              Logs are captured during live runs. Historical runs may not have logs.
            </span>
          </div>
        ) : (
          <div className="step-groups-list">
            {/* Commit message banner */}
            {run?.commitMessage && (
              <div className="commit-banner">
                <span className="commit-banner-label">commit:</span>
                {run.commitMessage}
              </div>
            )}

            {/* Step groups */}
            {stepGroups.map((group) => {
              const isOpen = openSteps.has(group.stepName);

              const iconClass = group.hasError
                ? "step-status-icon step-status-icon-error"
                : group.hasWarning
                  ? "step-status-icon step-status-icon-warning"
                  : "step-status-icon step-status-icon-success";

              const stepIcon = group.hasError ? "✕" : group.hasWarning ? "!" : "✓";

              return (
                <div key={group.stepName} className="step-group">
                  {/* Step header */}
                  <button
                    className={`step-header ${!isOpen ? "step-header-collapsed" : ""}`}
                    onClick={() => toggleStep(group.stepName)}
                  >
                    <span className={`step-chevron ${isOpen ? "step-chevron-open" : ""}`}>
                      ▶
                    </span>
                    <span className={iconClass}>{stepIcon}</span>
                    <span className="step-name">{group.stepName}</span>
                    <span className="step-line-count">{group.lines.length} lines</span>
                  </button>

                  {/* Log lines */}
                  {isOpen && (
                    <div className="log-body">
                      {group.lines.map((line, lineIdx) => {
                        const isErr = line.level === "error";
                        const isWarn = line.level === "warning";

                        const rowClass = isErr
                          ? "log-row log-row-error"
                          : isWarn
                            ? "log-row log-row-warning"
                            : "log-row";

                        const msgClass = isErr
                          ? "log-msg log-msg-error"
                          : isWarn
                            ? "log-msg log-msg-warning"
                            : "log-msg";

                        return (
                          <div key={line._id ?? lineIdx} className={rowClass}>
                            <span className="log-line-num">{lineIdx + 1}</span>
                            <span className="log-ts">{formatTime(line.timestamp)}</span>
                            {(isErr || isWarn) && (
                              <span
                                className={`log-level-badge ${isErr ? "log-level-badge-error" : "log-level-badge-warning"
                                  }`}
                              >
                                [{line.level}]
                              </span>
                            )}
                            <span className={msgClass}>{line.message}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </main>
  );
}
