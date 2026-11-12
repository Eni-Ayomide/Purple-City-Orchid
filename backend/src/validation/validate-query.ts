import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../errors/api-error.js";

export function validateQuery(schema: ZodType): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      }));
      next(new ApiError(400, "VALIDATION_ERROR", "Query parameters did not pass validation.", details));
      return;
    }

    response.locals["validatedQuery"] = result.data;
    next();
  };
}