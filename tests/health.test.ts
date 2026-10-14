import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("confirms the API is running without exposing configuration", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "purple-hearts-api",
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty("DATABASE_URL");
    expect(response.body).not.toHaveProperty("databaseUrl");
  });
});
