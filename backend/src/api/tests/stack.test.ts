import request from "supertest";
import app from "../../index";
import { prisma } from "../../db/client";
import { describe, it, expect, vi, afterAll } from 'vitest'

describe("POST /stack/create", () => {
  afterAll(async () => {
    await prisma.stack.deleteMany();
    await prisma.$disconnect();
  });

  it("should create a stack with email + json file", async () => {
    const response = await request(app)
      .post("/stack/create")
      .field("email", "test@example.com")
      .attach(
        "file",
        Buffer.from(
          JSON.stringify({
            name: "frontend",
            version: "0.0.0",
            dependencies: {
              react: "^19.0.0",
            },
            devDependencies: {
              "@eslint/js": "^10.0.1"
            }
          })
        ),
        "stack.json"
      );

    //response assertions
    expect(response.body.message).toBe("Success");
    expect(response.body.stack).toBeDefined();
    expect(response.body.stack.name).toBe("test@example.com");
    expect(response.statusCode).toBe(200);

    //database assertions 
    const stackInDb = await prisma.stack.findFirst({
      where: {
        name: "test@example.com",
      },
    });

    const reactDependency = await prisma.dependency.findFirst({
      where: {
        name: "react",
        versionRequirement : "^19.0.0"
      },
    });

    const eslintDependency = await prisma.dependency.findFirst({
      where: {
        name: "@eslint/js",
        versionRequirement : "^10.0.1"
      },
    });

    const analysis = await prisma.analysis.findFirst({
      where: {
        stackId: stackInDb?.id,
        status:"PENDING"
      },
    });

    expect(stackInDb).not.toBeNull();
    expect(reactDependency).not.toBeNull();
    expect(eslintDependency).not.toBeNull();
  });
});