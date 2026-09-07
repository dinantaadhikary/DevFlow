import request from "supertest";
import { createApp } from "../app";

const app = createApp();

describe("Auth API", () => {
  const testUser = {
    organizationName: `Test Org ${Date.now()}`,
    fullName: "Test User",
    email: `test${Date.now()}@example.com`,
    password: "supersecure123",
  };

  it("registers a new user and returns tokens", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe("owner");
  });

  it("rejects duplicate email registration", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: "wrongpassword" });
    expect(res.status).toBe(401);
  });
});
