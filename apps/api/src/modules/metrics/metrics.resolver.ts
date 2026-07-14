import { MetricsService } from "./metrics.service.js";

const metricsService = new MetricsService();

// TODO(security): Implement authorization checks to verify if the requesting user
// has access permissions for the given projectId before returning the metrics.

export const metricsResolver = {
   Query: {
      projectMetrics: async (
         _: unknown,
         { projectId }: { projectId: string }
      ) => {
         const data = await metricsService.getProjectMetrics(projectId);
         return {
            totalRuns: data.totalRuns,
            successfulRuns: data.successfulRuns,
            failedRuns: data.failedRuns,
            activeRuns: data.activeRuns,
            successRate: data.successRate,
            averageDuration: data.averageDuration,
            topBranches: data.topBranches.map(tb => ({
               branch: tb.name,
               count: tb.count
            }))
         };
      }
   }
};
