

export interface LogType {
    workflowRunId: number;
    stepName: string;
    level: "info" | "warning" | "error";
    message: string;
    timestamp: Date;
}

export interface WorkflowRunType {
    githubRunId: number;
    workflowName: string;
    branch: string;
    status: "queued" | "in_progress" | "completed";
    conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
    commitSha: string;
    commitMessage: string;
    actor: string;
    startedAt: Date;
    completedAt?: Date;
    durationSeconds: number;
}