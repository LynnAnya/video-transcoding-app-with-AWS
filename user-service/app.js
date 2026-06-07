const configPromise = require("./config");
require("dotenv").config();
const express = require("express");
const app = express();
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const session = require("express-session");
const initializeUserRoutes = require("./routes/users"); 
const adminRouter = require("./routes/admin");
const sqsQueueUrl = process.env.SQS_QUEUE_URL;
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function startServer() {
   try {
     const config = await configPromise;
     const { session_secret, dns } = config;
 
     // Configure session using config variables
     if (session_secret) {
       app.use(
         session({
           secret: session_secret,
           resave: false,
           saveUninitialized: false,
           cookie: {
             secure: process.env.NODE_ENV === "production",
             httpOnly: true,
             maxAge: 1000 * 60 * 30,
           },
         })
       );
     }
     // Await initialization 
     const usersRouter = await initializeUserRoutes();
     app.use("/", usersRouter); 
     app.use("/", adminRouter);
 
     // Start the server
     const PORT = process.env.PORT || 3000;
     app.listen(PORT, () => {
       console.log(`User Service is running on port ${PORT}`);
       console.log(`DNS is:  ${dns}`)
     });
   } catch (error) {
     console.error("Failed to initialize app configuration or routes:", error);
     process.exit(1);
   }
 }
 startServer();


