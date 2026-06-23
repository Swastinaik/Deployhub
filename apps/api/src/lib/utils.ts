import { LogType } from "./types.js";

// Helper to map Octokit status to schema status
export function mapStatus(status: string | null): "queued" | "in_progress" | "completed" {
    if (status === "completed") return "completed";
    if (status === "in_progress") return "in_progress";
    return "queued";
}

// Helper to map Octokit conclusion to schema conclusion
export function mapConclusion(conclusion: string | null): "success" | "failure" | "cancelled" | "skipped" | null {
    if (!conclusion) return null;
    if (["success", "failure", "cancelled", "skipped"].includes(conclusion)) {
        return conclusion as any;
    }
    if (conclusion === "timed_out" || conclusion === "action_required" || conclusion === "stale") {
        return "failure";
    }
    return null;
}


export function parseLogLine(line: string) {
    const firstSpaceIdx = line.indexOf(" ");
    if (firstSpaceIdx === -1) {
        return { timestamp: new Date(), message: line };
    }
    const timestampStr = line.substring(0, firstSpaceIdx);
    const message = line.substring(firstSpaceIdx + 1);
    const parsedDate = Date.parse(timestampStr);
    if (!isNaN(parsedDate)) {
        return { timestamp: new Date(parsedDate), message };
    }
    return { timestamp: new Date(), message: line };
}

export function parseLogsofJob(logsText: string, job: any, logsArray: LogType[], runId: number) {
    const lines = logsText.split(/\r?\n/);
    let currentStepName = job.name || "Job Log";
    for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseLogLine(line);
        let msg = parsed.message;

        // Parse step grouping and level prefixes
        if (msg.startsWith("##[group]")) {
            currentStepName = msg.replace("##[group]", "").trim();
            continue;
        }
        if (msg.startsWith("##[endgroup]")) {
            continue;
        }

        let level: "info" | "warning" | "error" = "info";
        if (msg.startsWith("##[warning]")) {
            level = "warning";
            msg = msg.replace("##[warning]", "").trim();
        } else if (msg.startsWith("##[error]")) {
            level = "error";
            msg = msg.replace("##[error]", "").trim();
        } else if (msg.startsWith("##[info]")) {
            msg = msg.replace("##[info]", "").trim();
        }

        logsArray.push({
            workflowRunId: runId,
            stepName: currentStepName,
            level,
            message: msg,
            timestamp: parsed.timestamp,
        });
    }
}