import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { NextFunction, Request, Response } from "express";
import { Env } from "./env.config";
import { COOKIE_NAME } from "../utils/cookie";
import { UnauthorizedException } from "../utils/app-error";
import { findByIdUserService } from "../services/user.service";
import { UserDocument } from "../models/user.model";

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => req.cookies?.[COOKIE_NAME] ?? null,
      ]),
      secretOrKey: Env.JWT_SECRET,
      audience: "user",
      algorithms: ["HS256"],
    },
    async ({ userId }, done) => {
      try {
        const user = userId ? await findByIdUserService(userId) : null;
        return done(null, user || false);
      } catch (error) {
        return done(error, false);
      }
    },
  ),
);

export const passportAuthenticateJwt = (
  req: Request,
  res: Response,
  next: NextFunction,
) =>
  passport.authenticate(
    "jwt",
    { session: false },
    (err: unknown, user: UserDocument | false) => {
      if (err) return next(err);
      if (!user) return next(new UnauthorizedException("Not authenticated"));
      req.user = user;
      next();
    },
  )(req, res, next);
