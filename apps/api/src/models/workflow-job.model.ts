// apps/api/src/models/workflow-job.model.ts

import { Schema, model } from "mongoose";

const workflowJobSchema = new Schema(
    {
        githubJobId: {
            type: Number,
            required: true,
            unique: true,
        },
        githubRunId: {
            type: Number,
            required: true,
            index: true,
        },
        projectId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            required: true,
        },
        conclusion: {
            type: String,
            default: null,
        },
        runnerName: {
            type: String,
            default: null,
        },
        startedAt: Date,
        completedAt: Date,
        steps: {
            type: [Schema.Types.Mixed],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

export const WorkflowJobModel = model("WorkflowJob", workflowJobSchema);
