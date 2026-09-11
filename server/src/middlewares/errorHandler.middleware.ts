import { ErrorRequestHandler, NextFunction } from "express";
import { ZodError } from "zod";
import { HTTPSTATUS } from "../config/http.config";
import { AppError, ErrorCodes } from "../utils/app-error";

const DUPLICATE_KEY_CODE = 11000;

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next: NextFunction,
) => {
  console.error(`Error occurred: ${req.path}`, error?.stack ?? error?.message ?? error);

  if (error instanceof ZodError) {
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
    return res.status(HTTPSTATUS.CONFLICT).json({
      message: "Resource already exists",
      errorCode: ErrorCodes.ERR_CONFLICT,
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      errorCode: error.errorCode,
    });
  }

  return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
    message: "Internal Server Error",
    error: error?.message || "Something went wrong",
    errorCode: ErrorCodes.ERR_INTERNAL,
  });
};
