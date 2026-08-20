// auth.middleware.ts

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import { getOctokitForUser } from "./auth.utils.js";
import { prisma } from "../../db.js";
import { getCache, setCache } from "../../lib/cache.js";

export interface AuthedRequest extends Request {
    octokit?: ReturnType<typeof getOctokitForUser>;
    userId?: string
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    const token = req.cookies.access_token;

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }
    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_ACCESS_SECRET!
        ) as { userId: string };

        let user = await getCache<any>(`user:profile:${payload.userId}`);
        if (!user) {
            user = await prisma.user.findUnique({ where: { id: payload.userId } });
            if (!user) return res.status(401).send("not linked");
            await setCache(`user:profile:${payload.userId}`, user, 3600);
        }

        req.octokit = getOctokitForUser(user.githubAccessToken!);
        req.userId = user.id;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid token",
        });
    }
}