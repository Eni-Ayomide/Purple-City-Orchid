import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error-handler.js";
import { validateBody } from "../src/validation/validate-body.js";

describe("request validation", () => {
  it("returns a structured 400 response for an invalid request body", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/",
      validateBody(z.object({ displayName: z.string().min(2) })),
      (request, response) => response.status(200).json({ displayName: request.body.displayName }),
    );
    app.use(errorHandler);

    const response = await request(app).post("/").send({ displayName: "" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["displayName"] })]),
    );
  });
});
