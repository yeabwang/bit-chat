import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import passport from "passport";
import { Env } from "./config/env.config";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "./config/http.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import { NotFoundException } from "./utils/app-error";
import connectDatabase from "./config/database.config";
import routes from "./routes";
import "./config/passport.config";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: Env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(passport.initialize());

app.get(
  "/health",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(HTTPSTATUS.OK).json({
      message: "healthy server",
      status: "OK",
    });
  }),
);

app.use("/api", routes);

app.use((_req: Request, _res: Response, next: NextFunction) =>
  next(new NotFoundException("Route not found")),
);

app.use(errorHandler);

connectDatabase().then(() => {
  app.listen(Number(Env.PORT), () => {
    console.log(`Server running on port ${Env.PORT} in ${Env.NODE_ENV} mode`);
  });
});
