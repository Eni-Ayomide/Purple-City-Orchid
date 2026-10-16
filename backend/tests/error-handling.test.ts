import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/error-handler.js";

describe("centralized error handling", () => {
  it("returns 404 for unknown API routes", async () => {
    const response = await request(createApp()).get("/api/v1/not-a-route");

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: expect.stringContaining("No route found"),
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(createApp())
      .post("/api/v1/")
      .set("Content-Type", "application/json")
      .send('{"invalid":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("hides unexpected internal errors from clients", async () => {
    const app = express();
    app.get("/unexpected-error", () => {
      throw new Error("internal detail must not be returned");
    });
    app.use(errorHandler);

    const response = await request(app).get("/unexpected-error");

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
    expect(JSON.stringify(response.body)).not.toContain("internal detail");
  });
});
