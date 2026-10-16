import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/api-error.js";

type ParserError = Error & {
  status?: number;
  type?: string;
};

export const errorHandler: ErrorRequestHandler = (error: ParserError, request, response, _next) => {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error.type === "entity.parse.failed") {
    apiError = new ApiError(400, "INVALID_JSON", "Request body must contain valid JSON.");
  } else if (error.type === "entity.too.large") {
    apiError = new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the allowed size.");
  } else {
    apiError = new ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
  }

  if (apiError.statusCode >= 500) {
    logger.error({ err: error, requestId: request.id }, "Request failed");
  }

  response.status(apiError.statusCode).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
    ...(request.id ? { requestId: request.id } : {}),
  });
};
