import { WorkflowRunModel } from "../../models/workflow-run.model.js";
import { getCache, setCache } from "../../lib/cache.js";

// TODO(security): Ensure authentication and authorization checks (verifying that the user
// requesting metrics has access to the specified projectId) are performed at the resolver/controller level.

export interface BranchMetric {
   name: string;
   count: number;
}

export interface ProjectMetricsResult {
   totalRuns: number;
   successfulRuns: number;
   failedRuns: number;
   cancelledRuns: number;
   activeRuns: number;
   successRate: number;
   failureRate: number;
   averageDuration: number;
   topBranches: BranchMetric[];
}

export class MetricsService {
   async getProjectMetrics(projectId: string): Promise<ProjectMetricsResult> {
      const cacheKey = `metrics:project:${projectId}`;
      const cachedMetrics = await getCache<ProjectMetricsResult>(cacheKey);
      if (cachedMetrics) {
         return cachedMetrics;
      }

      const totalRuns = await WorkflowRunModel.countDocuments({
         projectId
      });

      const successfulRuns = await WorkflowRunModel.countDocuments({
         projectId,
         conclusion: "success"
      });

      const failedRuns = await WorkflowRunModel.countDocuments({
         projectId,
         conclusion: "failure"
      });

      const cancelledRuns = await WorkflowRunModel.countDocuments({
         projectId,
         conclusion: "cancelled"
      });

      const activeRuns = await WorkflowRunModel.countDocuments({
         projectId,
         status: "in_progress"
      });

      const successRate = totalRuns === 0
         ? 0
         : (successfulRuns / totalRuns) * 100;

      const failureRate = totalRuns === 0
         ? 0
         : (failedRuns / totalRuns) * 100;

      const duration = await WorkflowRunModel.aggregate([
         {
            $match: {
               projectId,
               durationSeconds: {
                  $exists: true
               }
            }
         },
         {
            $group: {
               _id: null,
               avgDuration: {
                  $avg: "$durationSeconds"
               }
            }
         }
      ]);

      const averageDuration = duration.length > 0 ? duration[0].avgDuration : 0;

      const branches = await WorkflowRunModel.aggregate([
         {
            $match: {
               projectId
            }
         },
         {
            $group: {
               _id: "$branch",
               count: {
                  $sum: 1
               }
            }
         },
         {
            $sort: {
               count: -1
            }
         },
         {
            $limit: 5
         }
      ]);

      const topBranches = branches.map(b => ({
         name: b._id,
         count: b.count
      }));

      // Fetch workflow runs to get their githubRunId for querying build logs
      const workflowRuns = await WorkflowRunModel.find({ projectId }, "githubRunId");
      const workflowIds = workflowRuns.map(run => run.githubRunId);

      const metricsResult = {
         totalRuns,
         successfulRuns,
         failedRuns,
         cancelledRuns,
         activeRuns,
         successRate,
         failureRate,
         averageDuration,
         topBranches
      };

      await setCache(cacheKey, metricsResult, 3600);

      return metricsResult;
   }
}
