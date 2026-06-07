const request = require("supertest");
const express = require("express");
const awsMock = require("aws-sdk-mock");
const initializeProcessVideoRoutes = require("../routes/video");

/**
 * Test with S3 user video --> videos/07fd203a/10_sec_2D_Test_animation_360.mp4
 */

// Mock S3 client
awsMock.mock("S3", "putObject", (params, callback) => {
  callback(null, "Successfully uploaded data to S3");
});
awsMock.mock("S3", "getObject", (params, callback) => {
  // Simulate real video content in S3 without actual download
  callback(null, { Body: Buffer.from("simulated-video-content") });
});

describe("Video Service API", () => {
  let app;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock middleware to add req.session.user for testing
    app.use((req, res, next) => {
      req.session = { user: { id: "mockUserId", name: "malee" } };
      next();
    });

    app.use("/", await initializeProcessVideoRoutes());
  });

  afterAll(() => {
    awsMock.restore();
  });

  test("should upload a video successfully", async () => {
    const response = await request(app)
      .post("/upload-video")
      .attach("file", Buffer.from("simulated-video-content"), "10_sec_2D_Test_animation_360.mp4");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("videoId");
    expect(response.body).toHaveProperty("title", "10_sec_2D_Test_animation_360.mp4");
  });

  test("should process a video and return a download link", async () => {
    const response = await request(app)
      .post("/process-video")
      .send({ videoId: "07fd203a", format: "360.mp4", title: "10_sec_2D_Test_animation_360.mp4" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("downloadLink");
  });

  test("should fail to upload without a file", async () => {
    const response = await request(app)
      .post("/upload-video")
      .send();

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error", "No file uploaded");
  });

  test("should fail to process video with missing parameters", async () => {
    const response = await request(app)
      .post("/process-video")
      .send({ format: "360.mp4" });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error", "Video ID and format are required.");
  });
});
