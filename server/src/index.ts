import "dotenv/config";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Env } from "./config/env.config";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "./config/http.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import connectDatabase from "./config/database.config";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: Env.CLIENT_ORIGIN,
    credentials: true,
  }),
);

app.get(
  "/health",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(HTTPSTATUS.OK).json({
      message: "healthy server",
      status: "OK",
    });
  }),
);

app.use(errorHandler);

connectDatabase().then(() => {
  app.listen(Env.PORT, () => {
    console.log(`Server running on port ${Env.PORT} in ${Env.NODE_ENV} mode`);
  });
});
