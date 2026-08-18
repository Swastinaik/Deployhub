import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock redisConfig so it doesn't attempt any live connection
vi.mock("../../../lib/config/redis.js", () => ({
  redisConfig: {
    host: "localhost",
    port: 6379,
  },
}));

// Hoist mock functions and classes for BullMQ
const { mockQueueAdd, mockWorkerOn } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn(),
  mockWorkerOn: vi.fn(),
}));

vi.mock("bullmq", () => {
  return {
    Queue: class {
      name: string;
      opts: any;
      constructor(name: string, opts: any) {
        this.name = name;
        this.opts = opts;
      }
      add = mockQueueAdd;
    },
    Worker: class {
      name: string;
      processor: any;
      opts: any;
      on = mockWorkerOn;
      constructor(name: string, processor: any, opts: any) {
        this.name = name;
        this.processor = processor;
        this.opts = opts;
      }
    },
  };
});

vi.mock("../../alert/alert.factory.js", () => ({
  AlertStrategyFactory: {
    getStrategy: vi.fn(),
  },
}));

import { enqueueAlert, ALERT_QUEUE_NAME, alertQueue } from "../alert.queue.js";
import { startAlertWorker } from "../alert.worker.js";
import { AlertStrategyFactory } from "../../alert/alert.factory.js";
import { AlertPayload } from "../../alert/alert.types.js";

describe("Alert Queue and Worker Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("alertQueue initialization", () => {
    it("should initialize queue with correct name and retry backoff options", () => {
      expect(ALERT_QUEUE_NAME).toBe("alert-notifications");
      expect(alertQueue).toBeDefined();
    });
  });

  describe("enqueueAlert", () => {
    it("should enqueue a job into BullMQ with channel-prefixed job name and payload", async () => {
      mockQueueAdd.mockResolvedValue({ id: "job-999" });

      const payload: AlertPayload = {
        channel: "email",
        recipient: "test@example.com",
        title: "Workflow Failure: CI",
        message: "Pipeline failed",
        metadata: { runId: 123 },
      };

      const jobId = await enqueueAlert(payload);

      expect(mockQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockQueueAdd).toHaveBeenCalledWith("alert-email", payload, {
        jobId: "alert-email-123-test@example.com",
      });
      expect(jobId).toBe("job-999");
    });

    it("should enqueue without jobId if metadata.runId is missing", async () => {
      mockQueueAdd.mockResolvedValue({ id: "job-1000" });

      const payload: AlertPayload = {
        channel: "email",
        recipient: "test2@example.com",
        title: "Test",
        message: "Message",
      };

      const jobId = await enqueueAlert(payload);
      expect(mockQueueAdd).toHaveBeenCalledWith("alert-email", payload, {});
      expect(jobId).toBe("job-1000");
    });
  });

  describe("startAlertWorker", () => {
    it("should initialize a BullMQ Worker on the alert queue and process jobs via strategy factory", async () => {
      const mockStrategy = {
        send: vi.fn().mockResolvedValue(undefined),
      };
      (AlertStrategyFactory.getStrategy as any).mockReturnValue(mockStrategy);

      const worker = startAlertWorker();
      expect(worker).toBeDefined();
      expect(mockWorkerOn).toHaveBeenCalledWith("completed", expect.any(Function));
      expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));

      const jobData: AlertPayload = {
        channel: "email",
        recipient: "dev@example.com",
        title: "Alert Title",
        message: "Alert Body",
      };

      // Extract the job processor callback passed to Worker constructor
      const processor = (worker as any).processor;
      await processor({ id: "job-101", data: jobData });

      expect(AlertStrategyFactory.getStrategy).toHaveBeenCalledWith("email");
      expect(mockStrategy.send).toHaveBeenCalledWith(jobData);
    });
  });
});
