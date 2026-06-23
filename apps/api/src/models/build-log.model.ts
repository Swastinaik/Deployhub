// apps/api/src/models/build-log.model.ts

import { Schema, model } from "mongoose";

const buildLogSchema = new Schema(
    {
        workflowRunId: {
            type: Number,
            required: true,
            index: true,
        },

        stepName: {
            type: String,
        },

        level: {
            type: String,
            enum: ["info", "warning", "error"],
            default: "info",
        },

        message: {
            type: String,
            required: true,
        },

        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

export const BuildLogModel = model(
    "BuildLog",
    buildLogSchema
);