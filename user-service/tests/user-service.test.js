// tests/user-service.test.js

// 0. Set environment variables before any imports
process.env.QUT_USERNAME = "n11363657@qut.edu.au";
process.env.AWS_REGION = "ap-southeast-2"; // Replace with your actual region

// 1. Mock aws-jwt-verify before importing any modules that use it
jest.mock('aws-jwt-verify', () => ({
    CognitoJwtVerifier: {
        create: jest.fn().mockReturnValue({
            verify: jest.fn().mockResolvedValue({
                sub: "mockSub",
                "cognito:username": "testuser",
                email: "testuser@example.com",
            }),
        }),
    },
}));

// 2. Import necessary modules after mocking
const { mockClient } = require("aws-sdk-client-mock");
const { 
    CognitoIdentityProviderClient, 
    AdminCreateUserCommand, 
    AdminSetUserPasswordCommand, 
    AdminAddUserToGroupCommand, 
    InitiateAuthCommand, 
    AdminListGroupsForUserCommand 
} = require("@aws-sdk/client-cognito-identity-provider");
const { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    DeleteCommand, 
    QueryCommand, 
    PutCommand, 
    GetCommand 
} = require("@aws-sdk/lib-dynamodb");

const request = require("supertest");
const express = require("express");
const session = require("express-session");
const initializeUserRoutes = require("../routes/users");
const adminRouter = require("../routes/admin");

// 3. Mock AWS clients
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoDbMock = mockClient(DynamoDBDocumentClient);

// 4. Mock user and video data
const mockUserData = { 
    username: "testuser", 
    email: "testuser@example.com", 
    password: "Test1234!" 
};

const mockVideoData = [
    {
        'qut-username': "n11363657@qut.edu.au",
        videoId: "123",
        s3key: "videos/10_sec_2D_Test_animation_360.mp4",
        title: "Test Video",
        username: "testuser",
        duration: "0h 0m 11s",
        thumbnail: "https://i.ytimg.com/vi/BB49x_uMlGA/maxresdefault.jpg",
        youtubeLink: "https://www.youtube.com/watch?v=BB49x_uMlGA",
        type: "mp4",
        quality: 360,
    },
    // Additional mock videos can be added here if needed
];

describe("User Service API", () => {
  let app;

  beforeAll(async () => {
    // Initialize express application
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "testSecret",
      resave: false,
      saveUninitialized: false
    }));

    // Mock logged-in user session
    app.use((req, res, next) => {
      req.session.user = { 
          username: mockUserData.username, 
          email: mockUserData.email 
      };
      next();
    });

    // Initialize routes
    app.use("/", await initializeUserRoutes());
    app.use("/", adminRouter);
  });

  beforeEach(() => {
    cognitoMock.reset();
    dynamoDbMock.reset();

    // Set up AWS Cognito mocks
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});
    cognitoMock.on(InitiateAuthCommand).resolves({
      AuthenticationResult: { 
          AccessToken: "header.payload.signature",  // Valid JWT structure
          IdToken: "header.payload.signature"       // Valid JWT structure
      }
    });
    cognitoMock.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: "normalUser" }] });

    // Set up DynamoDB mocks with conditional responses based on TableName
    dynamoDbMock.on(ScanCommand).callsFake((input) => {
        // Uncomment the next line for debugging purposes
        // console.log(`Mock ScanCommand called on TableName: ${input.TableName}`);
        if (input.TableName === "n11363657-assign2-users") {  // usersTableName
            return { Items: [mockUserData] };
        }
        if (input.TableName === "n11363657-assign2-videos") { // videosTableName
            return { Items: mockVideoData };
        }
        return {};
    });

    // Mock other DynamoDB commands
    dynamoDbMock.on(QueryCommand).resolves({ Items: mockVideoData });
    dynamoDbMock.on(DeleteCommand).resolves({});
    dynamoDbMock.on(PutCommand).resolves({});
    dynamoDbMock.on(GetCommand).resolves({ Item: mockUserData });
  });

  afterAll(() => {
    cognitoMock.restore();
    dynamoDbMock.restore();
  });

  // Test cases

  test("should signup a user successfully", async () => {
    const response = await request(app)
      .post("/signup")
      .send(mockUserData);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "User registered successfully." });
  });

  test("should login a user successfully", async () => {
    const response = await request(app)
      .post("/login")
      .send({ username: mockUserData.username, password: mockUserData.password });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty("redirectUrl");
  });

  test("should logout a user successfully", async () => {
    const response = await request(app).post("/logout");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "Logout successful" });
  });

  test("should fetch user videos successfully", async () => {
    const response = await request(app).get(`/videos/${mockUserData.username}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockVideoData);
  });

  test("should fetch all users successfully", async () => {
    const response = await request(app).get("/users");
    expect(response.status).toBe(200);
    expect(response.body).toContainEqual(mockUserData);
  });

  test("should delete a user successfully", async () => {
    const response = await request(app).delete(`/users/${mockUserData.username}`);
    expect(response.status).toBe(200);
    expect(response.text).toBe(`User ${mockUserData.username} deleted successfully!`);
  });

  test("should fetch videos for a specific user successfully", async () => {
    const response = await request(app).get(`/videosData/${mockUserData.username}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockVideoData);
  });

  test("should delete a user video successfully", async () => {
    const response = await request(app).delete(`/videos/123`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Video with ID 123 deleted successfully" });
  });
});
