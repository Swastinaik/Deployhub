export const metricsTypeDefs = `#graphql
type ProjectMetrics {
  totalRuns: Int!
  successfulRuns: Int!
  failedRuns: Int!
  activeRuns: Int!

  successRate: Float!

  averageDuration: Float!

  topBranches: [BranchMetric!]!
}

type BranchMetric {
  branch: String!
  count: Int!
}

type Query {
  projectMetrics(
     projectId: ID!
  ): ProjectMetrics!
}
`;
