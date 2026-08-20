import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../db.js";
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt.js";
import { getGithubAccessToken, getGithubUser, getGithubUserEmails } from "./github.service.js";
import { getCache, setCache, deleteCache } from "../../lib/cache.js";

export async function redirectToGithub(
    req: Request,
    res: Response
) {
    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        scope: "repo user",
    });

    const githubUrl =
        `https://github.com/login/oauth/authorize?${params}`;

    res.redirect(githubUrl);
}


// auth.controller.ts

export async function githubCallback(
    req: Request,
    res: Response
) {
    const code = req.query.code as string;

    const tokenData =
        await getGithubAccessToken(code);

    const githubUser =
        await getGithubUser(
            tokenData.access_token
        );

    // Fetch primary verified email if not present in public profile
    const userEmail = githubUser.email || (await getGithubUserEmails(tokenData.access_token));

    let user = await prisma.user.findUnique({
        where: {
            githubId: String(githubUser.id),
        },
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                githubId: String(githubUser.id),
                username: githubUser.login,
                email: userEmail || null,
                avatarUrl: githubUser.avatar_url,
                githubAccessToken: tokenData.access_token,
            },
        });
    } else {
        user = await prisma.user.update({
            where: {
                githubId: String(githubUser.id),
            },
            data: {
                email: userEmail || user.email,
                githubAccessToken: tokenData.access_token,
            },
        });
    }

    // Invalidate cached user profile on login/token update
    await deleteCache(`user:profile:${user.id}`);

    const accessToken =
        generateAccessToken(user.id);

    const refreshToken =
        generateRefreshToken(user.id);

    res.cookie(
        "access_token",
        accessToken,
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000, // 15 minutes, matches JWT expiry
        }
    );

    res.cookie(
        "refresh_token",
        refreshToken,
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT expiry
        }
    );

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    res.redirect(
        `${clientUrl}/dashboard`
    );
}

export async function refreshToken(req: Request, res: Response) {
    const token = req.cookies.refresh_token;

    if (!token) {
        return res.status(401).json({ message: "No refresh token" });
    }

    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_REFRESH_SECRET!
        ) as { userId: string };

        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        // Rotate both tokens for better security
        const newAccessToken = generateAccessToken(user.id);
        const newRefreshToken = generateRefreshToken(user.id);

        res.cookie("access_token", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000,
        });

        res.cookie("refresh_token", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({ message: "Token refreshed" });
    } catch {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
}

export async function getCurrentUser(req: Request, res: Response): Promise<Response> {
  const token = req.cookies.refresh_token;

  if (!token) {
    return res.status(401).json({ message: "No refresh token" });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET!
    ) as { userId: string };

    let user = await getCache<any>(`user:profile:${payload.userId}`);
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          email: true,
        },
      });

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      await setCache(`user:profile:${payload.userId}`, user, 3600);
    }

    return res.status(200).json({
      status: "success",
      data: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        email: user.email,
      },
    });
  } catch (err: any) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}