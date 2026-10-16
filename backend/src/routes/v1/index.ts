import { Router } from "express";

export const v1Router = Router();

v1Router.get("/", (_request, response) => {
  response.status(200).json({
    name: "Purple Hearts API",
    version: "v1",
  });
});
