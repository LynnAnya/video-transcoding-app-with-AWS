require("dotenv").config();
const configPromise = require("./config"); 
//const express = require("express");
//const app = express();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { processVideoMessage } = require("./videoProcessor");

async function receiveAndProcessMessages() {
  try {
      const config = await configPromise;
      const { aws_region: AWS_REGION, dns: DNS } = config;
      const { SQS_QUEUE_URL } = process.env;

      // Validate required configurations
      if (!AWS_REGION || !DNS) {
          console.error("Missing required configuration parameters: AWS_REGION or DNS.");
          process.exit(1);
      }
      if (!SQS_QUEUE_URL) {
          console.error("Missing required environment variable: SQS_QUEUE_URL.");
          process.exit(1);
      }
      const sqsClient = new SQSClient({ region: AWS_REGION });
      console.log(`Video Service started. DNS: ${DNS}`);
      console.log(`Listening to SQS Queue: ${SQS_QUEUE_URL}`);
      while (true) {
          const receiveParams = {
              QueueUrl: SQS_QUEUE_URL,
              MaxNumberOfMessages: 10,
              WaitTimeSeconds: 20, 
          };
          try {
              const data = await sqsClient.send(new ReceiveMessageCommand(receiveParams));
              if (data.Messages && data.Messages.length > 0) {
                  for (const message of data.Messages) {
                      let messageBody;
                      try {
                          messageBody = JSON.parse(message.Body);
                      } catch (err) {
                          console.warn("Received invalid JSON message:", message.Body);
                          continue; // Skip this message and go to the next one
                      }
                      if (!messageBody.action || !messageBody.data) {
                          console.warn("Received unexpected message format:", messageBody);
                          continue; // Skip this message if it's not in the expected format
                      }
                      console.log("Processing valid message:", messageBody);
                      await processVideoMessage(messageBody); // return url link 
                      // Delete the message after successful processing
                      const deleteParams = {
                          QueueUrl: SQS_QUEUE_URL,
                          ReceiptHandle: message.ReceiptHandle
                      };
                      await sqsClient.send(new DeleteMessageCommand(deleteParams));
                      console.log("Message processed and deleted:", message.MessageId);
                  }
              } else {
                  console.log("No messages received. Waiting...");
              }
          } catch (err) {
              console.error("Error receiving or processing message:", err);
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
          }
      }
  } catch (error) {
      console.error("Fatal error in receiveAndProcessMessages:", error);
      process.exit(1);
  }
}
receiveAndProcessMessages();


/** 
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function receiveAndProcessMessages() {
  while (true) {
      const receiveParams = {
          QueueUrl: sqsQueueUrl,
          MaxNumberOfMessages: 10,  // Process up to 10 messages at a time
          WaitTimeSeconds: 20,      
      };
      try {
          const data = await sqsClient.send(new ReceiveMessageCommand(receiveParams));
          if (data.Messages) {
              for (const message of data.Messages) {
                  const messageBody = JSON.parse(message.Body);
                  console.log("Received message:", messageBody);

                  // Process the message, such as transcoding the video
                  await processVideoMessage(messageBody);

                  // Delete the message after successful processing
                  const deleteParams = {
                      QueueUrl: sqsQueueUrl,
                      ReceiptHandle: message.ReceiptHandle
                  };
                  await sqsClient.send(new DeleteMessageCommand(deleteParams));
                  console.log("Message processed and deleted:", message.MessageId);
              }
          } else {
              console.log("No messages received");
          }
      } catch (err) {
          console.error("Error receiving or processing message:", err);
      }
  }
}

async function processVideoMessage(messageBody) {
  const { action, data } = messageBody;

  if (action === "ProcessVideo") {
      const { videoId, format, title } = data;

      // Assuming this function exists in your video routes for video processing
      const videoRouter = await initializeProcessVideoRoutes();
      await videoRouter.processVideo({ videoId, format, title });
  } else {
      console.log("Unknown action:", action);
  }
}


async function startServer() {
   try {
     const config = await configPromise;
     const { dns } = config;
     //const { session_secret, dns } = config;
 
     // Await initialization 
     const videoRouter = await initializeProcessVideoRoutes();
     app.use("/", videoRouter);
     
     // Start server
     const PORT = process.env.PORT || 3001;
     app.listen(PORT, () => {
       console.log(`Video service is running on port ${PORT}`);
       console.log(`DNS is:  ${dns}`)
     });
   } catch (error) {
     console.error("Failed to initialize app configuration or routes:", error);
     process.exit(1);
   }
 }
 startServer();
*/
