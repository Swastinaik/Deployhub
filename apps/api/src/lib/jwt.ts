// src/lib/jwt.ts

import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export function generateAccessToken(userId: string) {
    return jwt.sign(
        { userId },
        ACCESS_SECRET,
        { expiresIn: "15m" }
    );
}

export function generateRefreshToken(userId: string) {
    return jwt.sign(
        { userId },
        REFRESH_SECRET,
        { expiresIn: "7d" }
    );
}