import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing github.services
vi.mock("../../../db.js", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../queues/alert.queue.js", () => ({
  enqueueAlert: vi.fn().mockResolvedValue("job-12345"),
}));

vi.mock("../../../models/workflow-run.model.js", () => ({
  WorkflowRunModel: {
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../sockets/socket.service.js", () => ({
  getSocketManager: () => ({
    broadcastWorkflowEvent: vi.fn(),
    broadcastJobEvent: vi.fn(),
  }),
}));

vi.mock("../../auth/auth.utils.js", () => ({
  getOctokitForUser: vi.fn(),
}));

import {
  handleWorkflowRunEvent,
  triggerWorkflowFailureAlert,
  syncLatestWorkflowRuns,
} from "../github.services.js";
import { enqueueAlert } from "../../queues/alert.queue.js";
import { prisma } from "../../../db.js";

describe("GitHub Services - Workflow Failure Alerting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("triggerWorkflowFailureAlert", () => {
    it("should enqueue alert for all project members with valid emails", async () => {
      (prisma.projectMember.findMany as any).mockResolvedValue([
        {
          userId: "user-1",
          projectId: "proj-abc",
          user: { email: "dev1@example.com" },
        },
        {
          userId: "user-2",
          projectId: "proj-abc",
          user: { email: "dev2@example.com" },
        },
        {
          userId: "user-3",
          projectId: "proj-abc",
          user: { email: null },
        },
        {
          userId: "user-4",
          projectId: "proj-abc",
          user: { email: "dev1@example.com" }, // Duplicate email check
        },
      ]);

      const project = { id: "proj-abc", repo_full_name: "deployhub/core-api" };
      const run = {
        id: 98765,
        name: "Deploy Production",
        branch: "main",
        conclusion: "failure",
        html_url: "https://github.com/deployhub/core-api/actions/runs/98765",
        actor: "devops-bot",
        commitSha: "sha123456",
        commitMessage: "Fix critical pipeline bug",
      };

      await triggerWorkflowFailureAlert(project, run);

      // Should be called 2 times for 2 distinct valid emails (dev1 and dev2)
      expect(enqueueAlert).toHaveBeenCalledTimes(2);

      expect(enqueueAlert).toHaveBeenCalledWith({
        channel: "email",
        recipient: "dev1@example.com",
        title: "Workflow Failure: Deploy Production",
        message: 'Workflow "Deploy Production" for repository deployhub/core-api on branch "main" has failed.',
        metadata: {
          runId: 98765,
          repo: "deployhub/core-api",
          runUrl: "https://github.com/deployhub/core-api/actions/runs/98765",
          branch: "main",
          actor: "devops-bot",
          commitSha: "sha123456",
          commitMessage: "Fix critical pipeline bug",
          conclusion: "failure",
        },
      });

      expect(enqueueAlert).toHaveBeenCalledWith({
        channel: "email",
        recipient: "dev2@example.com",
        title: "Workflow Failure: Deploy Production",
        message: 'Workflow "Deploy Production" for repository deployhub/core-api on branch "main" has failed.',
        metadata: {
          runId: 98765,
          repo: "deployhub/core-api",
          runUrl: "https://github.com/deployhub/core-api/actions/runs/98765",
          branch: "main",
          actor: "devops-bot",
          commitSha: "sha123456",
          commitMessage: "Fix critical pipeline bug",
          conclusion: "failure",
        },
      });
    });

    it("should handle project with no member emails gracefully", async () => {
      (prisma.projectMember.findMany as any).mockResolvedValue([
        {
          userId: "user-1",
          projectId: "proj-abc",
          user: { email: null },
        },
      ]);

      const project = { id: "proj-abc", repo_full_name: "deployhub/core-api" };
      const run = {
        id: 11111,
        name: "Test Run",
      };

      await triggerWorkflowFailureAlert(project, run);

      expect(enqueueAlert).not.toHaveBeenCalled();
    });
  });

  describe("handleWorkflowRunEvent", () => {
    it("should trigger alert when workflow_run webhook event completes with failure", async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: "proj-abc",
        github_repo_id: 12345,
        repo_full_name: "deployhub/core-api",
        is_active: true,
      });

      (prisma.projectMember.findMany as any).mockResolvedValue([
        {
          userId: "user-1",
          projectId: "proj-abc",
          user: { email: "alice@example.com" },
        },
      ]);

      const webhookPayload = {
        repository: { id: 12345 },
        workflow_run: {
          id: 54321,
          name: "CI Pipeline",
          head_branch: "release-v1",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.com/deployhub/core-api/actions/runs/54321",
          actor: { login: "alice" },
          head_commit: { id: "c0ffee", message: "Initial commit" },
          run_started_at: "2026-08-14T05:00:00Z",
          updated_at: "2026-08-14T05:02:00Z",
        },
      };

      await handleWorkflowRunEvent(webhookPayload);

      expect(enqueueAlert).toHaveBeenCalledTimes(1);
      expect(enqueueAlert).toHaveBeenCalledWith({
        channel: "email",
        recipient: "alice@example.com",
        title: "Workflow Failure: CI Pipeline",
        message: 'Workflow "CI Pipeline" for repository deployhub/core-api on branch "release-v1" has failed.',
        metadata: {
          runId: 54321,
          repo: "deployhub/core-api",
          runUrl: "https://github.com/deployhub/core-api/actions/runs/54321",
          branch: "release-v1",
          actor: "alice",
          commitSha: "c0ffee",
          commitMessage: "Initial commit",
          conclusion: "failure",
        },
      });
    });

    it("should trigger alert when workflow_run completes with timed_out conclusion", async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: "proj-abc",
        github_repo_id: 12345,
        repo_full_name: "deployhub/core-api",
        is_active: true,
      });

      (prisma.projectMember.findMany as any).mockResolvedValue([
        {
          userId: "user-1",
          projectId: "proj-abc",
          user: { email: "alice@example.com" },
        },
      ]);

      const webhookPayload = {
        repository: { id: 12345 },
        workflow_run: {
          id: 54322,
          name: "E2E Tests",
          head_branch: "main",
          status: "completed",
          conclusion: "timed_out",
          html_url: "https://github.com/deployhub/core-api/actions/runs/54322",
          actor: { login: "alice" },
          head_commit: { id: "c0ffee2", message: "Run tests" },
          run_started_at: "2026-08-14T05:00:00Z",
          updated_at: "2026-08-14T05:30:00Z",
        },
      };

      await handleWorkflowRunEvent(webhookPayload);

      expect(enqueueAlert).toHaveBeenCalledTimes(1);
      expect(enqueueAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "alice@example.com",
          title: "Workflow Failure: E2E Tests",
        })
      );
    });

    it("should NOT trigger alert when workflow_run completes with success", async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: "proj-abc",
        github_repo_id: 12345,
        repo_full_name: "deployhub/core-api",
        is_active: true,
      });

      const webhookPayload = {
        repository: { id: 12345 },
        workflow_run: {
          id: 54323,
          name: "CI Pipeline",
          head_branch: "main",
          status: "completed",
          conclusion: "success",
          run_started_at: "2026-08-14T05:00:00Z",
          updated_at: "2026-08-14T05:01:00Z",
        },
      };

      await handleWorkflowRunEvent(webhookPayload);

      expect(enqueueAlert).not.toHaveBeenCalled();
    });

    it("should NOT trigger alert when workflow_run is in_progress", async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: "proj-abc",
        github_repo_id: 12345,
        repo_full_name: "deployhub/core-api",
        is_active: true,
      });

      const webhookPayload = {
        repository: { id: 12345 },
        workflow_run: {
          id: 54324,
          name: "CI Pipeline",
          head_branch: "main",
          status: "in_progress",
          conclusion: null,
          run_started_at: "2026-08-14T05:00:00Z",
        },
      };

      await handleWorkflowRunEvent(webhookPayload);

      expect(enqueueAlert).not.toHaveBeenCalled();
    });

    it("should NOT trigger alert if project is inactive or untracked", async () => {
      (prisma.project.findFirst as any).mockResolvedValue({
        id: "proj-abc",
        github_repo_id: 12345,
        repo_full_name: "deployhub/core-api",
        is_active: false,
      });

      const webhookPayload = {
        repository: { id: 12345 },
        workflow_run: {
          id: 54325,
          status: "completed",
          conclusion: "failure",
        },
      };

      await handleWorkflowRunEvent(webhookPayload);

      expect(enqueueAlert).not.toHaveBeenCalled();
    });
  });

  describe("syncLatestWorkflowRuns", () => {
    it("should trigger alert when new failed workflow runs are synced", async () => {
      (prisma.project.findUnique as any).mockResolvedValue({
        id: "proj-abc",
        repo_full_name: "deployhub/core-api",
        latestRunId: null,
      });

      (prisma.projectMember.findMany as any).mockResolvedValue([
        {
          userId: "user-1",
          projectId: "proj-abc",
          user: { email: "lead@example.com" },
        },
      ]);

      const octokitMock = {
        rest: {
          actions: {
            listWorkflowRunsForRepo: vi.fn().mockResolvedValue({
              data: {
                workflow_runs: [
                  {
                    id: 77701,
                    name: "Nightly Build",
                    head_branch: "main",
                    status: "completed",
                    conclusion: "failure",
                    html_url: "https://github.com/deployhub/core-api/actions/runs/77701",
                    head_commit: { id: "commit1", message: "Nightly update" },
                    actor: { login: "nightly-bot" },
                    run_started_at: "2026-08-14T01:00:00Z",
                    updated_at: "2026-08-14T01:15:00Z",
                  },
                ],
              },
            }),
          },
        },
      };

      await syncLatestWorkflowRuns(
        octokitMock,
        "proj-abc",
        "deployhub",
        "core-api"
      );

      expect(enqueueAlert).toHaveBeenCalledTimes(1);
      expect(enqueueAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "lead@example.com",
          title: "Workflow Failure: Nightly Build",
        })
      );
    });
  });
});
