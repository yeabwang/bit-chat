import jwt from "jsonwebtoken";
import { Response } from "express";
import { Env } from "../config/env.config";

type SetJwtAuthCookieParams = {
  res: Response;
  userId: string;
};

export const COOKIE_NAME = "accessToken";

// token and cookie holding it expire together
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: Env.NODE_ENV === "production",
  sameSite: (Env.NODE_ENV === "production" ? "strict" : "lax") as "strict" | "lax",
  path: "/",
};

export const setJwtAuthCookie = ({ res, userId }: SetJwtAuthCookieParams) => {
  const token = jwt.sign({ userId }, Env.JWT_SECRET, {
    audience: "user",
    expiresIn: SESSION_MAX_AGE_MS / 1000,
  });

  return res.cookie(COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: SESSION_MAX_AGE_MS,
  });
};

export const verifyJwtAuthToken = (token: string) => {
  return jwt.verify(token, Env.JWT_SECRET, { audience: "user" }) as {
    userId: string;
  };
};

export const clearJwtAuthCookie = (res: Response) => {
  return res.clearCookie(COOKIE_NAME, cookieOptions);
};
