
require("dotenv").config();
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const sqsQueueUrl = process.env.SQS_QUEUE_URL;
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

async function sendMessageToQueue(messageBody) {
  const params = {
    QueueUrl: sqsQueueUrl,
    MessageBody: JSON.stringify(messageBody),
    DelaySeconds: 0 
  };
  try {
    const data = await sqsClient.send(new SendMessageCommand(params));
    console.log("Message sent to SQS:", data.MessageId);
    return data.MessageId;
  } catch (err) {
    console.error("Error sending message to SQS:", err);
    throw err; // Propagate the error for the caller to handle
  }
}

async function receiveMessageFromQueue() {
  const params = {
    QueueUrl: sqsQueueUrl,
    MaxNumberOfMessages: 1, // Adjust as necessary
    WaitTimeSeconds: 20, // Long polling
  };
  try {
    const data = await sqsClient.send(new ReceiveMessageCommand(params));
    if (data.Messages && data.Messages.length > 0) {
      const message = data.Messages[0];
      const messageBody = JSON.parse(message.Body);

      // Return message body and receipt handle for deletion
      return { messageBody, receiptHandle: message.ReceiptHandle };
    }
  } catch (err) {
    console.error("Error receiving message from SQS:", err);
    throw err;
  }
  return null; 
}
// Function to delete a message from SQS
async function deleteMessageFromQueue(receiptHandle) {
  const params = {
    QueueUrl: sqsQueueUrl,
    ReceiptHandle: receiptHandle,
  };
  try {
    await sqsClient.send(new DeleteMessageCommand(params));
    console.log("Message deleted from SQS.");
  } catch (err) {
    console.error("Error deleting message from SQS:", err);
    throw err;
  }
}

module.exports = { sendMessageToQueue, receiveMessageFromQueue, deleteMessageFromQueue };
