import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../errors/api-error.js";

export function validateBody(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      }));
      next(new ApiError(400, "VALIDATION_ERROR", "Request body did not pass validation.", details));
      return;
    }

    request.body = result.data;
    next();
  };
}
