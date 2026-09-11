import { ErrorRequestHandler, NextFunction } from "express";
import { ZodError } from "zod";
import { HTTPSTATUS } from "../config/http.config";
import { AppError, ErrorCodes } from "../utils/app-error";

const DUPLICATE_KEY_CODE = 11000;

const logError = (path: string, status: number, error: unknown) => {
  if (status < HTTPSTATUS.INTERNAL_SERVER_ERROR) {
    const message = error instanceof Error ? error.message : String(error);
    return console.warn(`${status} ${path}: ${message}`);
  }
  console.error(
    `Error occurred: ${path}`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
};

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next: NextFunction,
) => {
  if (error instanceof ZodError) {
    logError(req.path, HTTPSTATUS.BAD_REQUEST, error);
    return res.status(HTTPSTATUS.BAD_REQUEST).json({
      message: "Validation failed",
      errors: error.issues.map(({ path, message }) => ({
        field: path.join("."),
        message,
      })),
      errorCode: ErrorCodes.ERR_BAD_REQUEST,
    });
  }

  if (error?.code === DUPLICATE_KEY_CODE) {
    logError(req.path, HTTPSTATUS.CONFLICT, error);
    return res.status(HTTPSTATUS.CONFLICT).json({
      message: "Resource already exists",
      errorCode: ErrorCodes.ERR_CONFLICT,
    });
  }

  if (error instanceof AppError) {
    logError(req.path, error.statusCode, error);
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  logError(req.path, HTTPSTATUS.INTERNAL_SERVER_ERROR, error);
  return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
    message: "Internal Server Error",
    error: error?.message || "Something went wrong",
    errorCode: ErrorCodes.ERR_INTERNAL,
  });
};
