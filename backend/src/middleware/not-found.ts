import type { RequestHandler } from "express";
import { ApiError } from "../errors/api-error.js";

export const notFound: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, "NOT_FOUND", `No route found for ${request.method} ${request.path}.`));
};
