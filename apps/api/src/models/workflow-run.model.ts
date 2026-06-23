// apps/api/src/models/workflow-run.model.ts

import { Schema, model, Types } from "mongoose";

const workflowRunSchema = new Schema(
    {
        projectId: {
            type: String,
            required: true,
            index: true,
        },

        githubRunId: {
            type: Number,
            required: true,
            unique: true,
        },

        workflowName: {
            type: String,
            required: true,
        },

        branch: {
            type: String,
            required: true,
        },

        status: {
            type: String,
            enum: [
                "queued",
                "in_progress",
                "completed",
            ],
            required: true,
        },

        lastLogLineFetched: {
            type: Number,
            default: 0
        },

        jobLogOffsets: {
            type: Map,
            of: Number,
            default: {}
        },

        lastLogSyncAt: {
            type: Date
        },

        conclusion: {
            type: String,
            enum: [
                "success",
                "failure",
                "cancelled",
                "skipped",
                null,
            ],
            default: null,
        },

        commitSha: {
            type: String,
            required: true,
        },

        commitMessage: {
            type: String,
        },

        actor: {
            type: String,
        },

        startedAt: Date,

        completedAt: Date,

        durationSeconds: Number,
    },
    {
        timestamps: true,
    }
);

export const WorkflowRunModel = model(
    "WorkflowRun",
    workflowRunSchema
);