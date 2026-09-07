import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validator";
import { loginService, registerService } from "../services/auth.service";
import {
  clearJwtAuthCookie,
  COOKIE_NAME,
  setJwtAuthCookie,
  verifyJwtAuthToken,
} from "../utils/cookie";
import { disconnectUser } from "../lib/socket";
import { HTTPSTATUS } from "../config/http.config";

export const registerController = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);
  const user = await registerService(body);

  return setJwtAuthCookie({ res, userId: String(user._id) })
    .status(HTTPSTATUS.CREATED)
    .json({
      message: "Account created",
      user,
    });
});

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const user = await loginService(body);

  return setJwtAuthCookie({ res, userId: String(user._id) })
    .status(HTTPSTATUS.OK)
    .json({
      message: "Signed in",
      user,
    });
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      disconnectUser(verifyJwtAuthToken(token).userId);
    } catch {
      // an unreadable token has no sockets to close
    }
  }

  return clearJwtAuthCookie(res).status(HTTPSTATUS.OK).json({
    message: "Signed out",
  });
});

export const authStatusController = asyncHandler(async (req: Request, res: Response) => {
  return res.status(HTTPSTATUS.OK).json({
    message: "Authenticated user",
    user: req.user,
  });
});
