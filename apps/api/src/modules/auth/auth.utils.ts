import { Octokit } from "@octokit/rest";
import crypto from "crypto";

const ENC_KEY = process.env.TOKEN_KEY!; // 32 bytes hex


export function getOctokitForUser(token: string) {
    return new Octokit({
        auth: token,
    });
}