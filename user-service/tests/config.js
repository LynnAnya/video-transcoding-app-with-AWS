jest.mock("../config", () => {
    return Promise.resolve({
      dns: "mock-dns-value",
      bucket_name: "mock-bucket-name",
      qut_username: "mock-username",
      purpose: "mock-purpose",
      aws_region: "mock-region",
      userpool_id: "mock-userpool-id",
      client_id: "mock-client-id",
      session_secret: "mock-session-secret",
    });
  });
  