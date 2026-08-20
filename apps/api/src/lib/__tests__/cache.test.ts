import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis functions
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockPipelineExec = vi.fn();
const mockPipelineDel = vi.fn();
const mockScanStream = vi.fn();
const mockOn = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

const fakeRedisInstance = {
  get: mockGet,
  set: mockSet,
  del: mockDel,
  scanStream: mockScanStream,
  pipeline: () => ({
    del: mockPipelineDel,
    exec: mockPipelineExec,
  }),
  on: mockOn,
  connect: mockConnect,
} as any;

vi.mock("ioredis", () => {
  return {
    Redis: vi.fn().mockImplementation(() => fakeRedisInstance),
  };
});

import {
  getCache,
  setCache,
  deleteCache,
  deletePattern,
  setRedisClientForTesting,
} from "../cache.js";

describe("Redis Cache Module (lib/cache.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRedisClientForTesting(fakeRedisInstance, true);
  });

  describe("getCache", () => {
    it("should return parsed JSON on cache hit", async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ userId: "u123", role: "admin" }));

      const result = await getCache<{ userId: string; role: string }>("user:session:u123");
      expect(mockGet).toHaveBeenCalledWith("user:session:u123");
      expect(result).toEqual({ userId: "u123", role: "admin" });
    });

    it("should return null on cache miss", async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await getCache("non-existent-key");
      expect(result).toBeNull();
    });

    it("should fail open and return null if redis throws error", async () => {
      mockGet.mockRejectedValueOnce(new Error("Redis connection dropped"));

      const result = await getCache("any-key");
      expect(result).toBeNull();
    });

    it("should return null if cache client is disconnected", async () => {
      setRedisClientForTesting(fakeRedisInstance, false);

      const result = await getCache("any-key");
      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("setCache", () => {
    it("should serialize and store data with TTL", async () => {
      mockSet.mockResolvedValueOnce("OK");

      await setCache("project:123", { name: "test-repo" }, 300);
      expect(mockSet).toHaveBeenCalledWith(
        "project:123",
        JSON.stringify({ name: "test-repo" }),
        "EX",
        300
      );
    });

    it("should serialize and store data without TTL if ttlSeconds is omitted", async () => {
      mockSet.mockResolvedValueOnce("OK");

      await setCache("static:key", { status: "active" });
      expect(mockSet).toHaveBeenCalledWith(
        "static:key",
        JSON.stringify({ status: "active" })
      );
    });

    it("should handle redis write errors gracefully without throwing", async () => {
      mockSet.mockRejectedValueOnce(new Error("Redis write failure"));

      await expect(setCache("err:key", { data: 1 })).resolves.not.toThrow();
    });
  });

  describe("deleteCache", () => {
    it("should delete single key", async () => {
      mockDel.mockResolvedValueOnce(1);

      await deleteCache("user:session:u123");
      expect(mockDel).toHaveBeenCalledWith("user:session:u123");
    });

    it("should delete multiple keys array", async () => {
      mockDel.mockResolvedValueOnce(2);

      await deleteCache(["key1", "key2"]);
      expect(mockDel).toHaveBeenCalledWith("key1", "key2");
    });
  });

  describe("deletePattern", () => {
    it("should scan and pipeline delete keys matching pattern", async () => {
      async function* fakeStream() {
        yield ["project:123:detail", "project:123:recent_runs"];
      }
      mockScanStream.mockReturnValueOnce(fakeStream());
      mockPipelineExec.mockResolvedValueOnce([[null, 1], [null, 1]]);

      await deletePattern("project:123:*");
      expect(mockScanStream).toHaveBeenCalledWith({ match: "project:123:*", count: 100 });
      expect(mockPipelineDel).toHaveBeenCalledWith("project:123:detail");
      expect(mockPipelineDel).toHaveBeenCalledWith("project:123:recent_runs");
      expect(mockPipelineExec).toHaveBeenCalled();
    });
  });
});
