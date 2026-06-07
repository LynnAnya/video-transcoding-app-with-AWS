require('dotenv').config();
const configPromise = require("../config"); // Import the config as a promise
const express = require("express");
const router = express.Router();
const { sendMessageToQueue, receiveMessageFromQueue, deleteMessageFromQueue } = require("../sqs");
const Cognito = require("@aws-sdk/client-cognito-identity-provider");
const jwt = require("aws-jwt-verify");
//const { addUser, getVideos } = require("../dynamodb");
const { addUser, getVideos, saveProcessingRequest, getProcessingRequest } = require("../dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
//const { Upload } = require('@aws-sdk/lib-storage');
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");


async function initializeRoutes() {
    const config = await configPromise;
    // Destructure config variables
    const { aws_region: Region, client_id: clientId, userpool_id: userPoolId, bucket_name: bucketName } = config;
    const s3Client = new S3Client({ region: Region });
    const router = express.Router();
    const upload = multer();

    function sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    }
    const client = new Cognito.CognitoIdentityProviderClient({ region: Region });
    const accessVerifier = jwt.CognitoJwtVerifier.create({
        userPoolId: userPoolId,
        tokenUse: "access",
        clientId: clientId,
    });
    const idVerifier = jwt.CognitoJwtVerifier.create({
        userPoolId: userPoolId,
        tokenUse: "id",
        clientId: clientId,
    });
    // 1. POST user sign up -- signup.html
    router.post('/signup', async (req, res) => {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.json({ success: false, message: 'All fields are required' });
        }
        try {
            const adminCreateUserCommand = new Cognito.AdminCreateUserCommand({
                UserPoolId: userPoolId,
                Username: username,
                TemporaryPassword: password,
                UserAttributes: [
                    { Name: "email", Value: email },
                    { Name: "email_verified", Value: "true" } // Auto verify email
                ],
                MessageAction: "SUPPRESS" // Suppress sending email
            });

            await client.send(adminCreateUserCommand);

            const setPasswordCommand = new Cognito.AdminSetUserPasswordCommand({
                UserPoolId: userPoolId,
                Username: username,
                Password: password,
                Permanent: true,
            });
            await client.send(setPasswordCommand);

            const addUserToGroupCommand = new Cognito.AdminAddUserToGroupCommand({
                UserPoolId: userPoolId,
                Username: username,
                GroupName: 'normalUser'
            });
            await client.send(addUserToGroupCommand);

            await addUser({
                username: username,
                email: email,
                email_verified: true,
            });
            res.json({ success: true, message: 'User registered successfully.' });
        } catch (error) {
            console.error("Error during signup:", error);
            res.json({ success: false, message: error.message });
        }
    });
    // 2. POST check match username + pwd -- login.html
    router.post('/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ success: false, message: 'All fields are required' });
        }
        try {
            const command = new Cognito.InitiateAuthCommand({
                AuthFlow: Cognito.AuthFlowType.USER_PASSWORD_AUTH,
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password,
                },
                ClientId: clientId,
            });
            const cognitoRes = await client.send(command);
            const accessToken = await accessVerifier.verify(
                cognitoRes.AuthenticationResult.AccessToken
            );
            const idToken = await idVerifier.verify(
                cognitoRes.AuthenticationResult.IdToken
            );
            req.session.user = {
                sub: idToken.sub,
                username: idToken['cognito:username'],
                email: idToken.email
            };
            req.session.tokens = {
                accessToken: cognitoRes.AuthenticationResult.AccessToken,
                idToken: cognitoRes.AuthenticationResult.IdToken
            };

            const listGroupsCommand = new Cognito.AdminListGroupsForUserCommand({
                UserPoolId: userPoolId,
                Username: username
            });
            const groupData = await client.send(listGroupsCommand);
            const groups = groupData.Groups.map(group => group.GroupName);
            req.session.user.groups = groups;

            if (groups.includes('admin')) {
                return res.json({
                    success: true,
                    message: 'Login successful',
                    redirectUrl: '/admin.html',
                    user: {
                        username: req.session.user.username,
                        email: req.session.user.email,
                        groups
                    }
                });
            } else {
                return res.json({
                    success: true,
                    message: 'Login successful',
                    redirectUrl: '/index.html',
                    user: {
                        username: req.session.user.username,
                        email: req.session.user.email,
                        groups
                    }
                });
            }
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ success: false, message: 'Login failed: ' + error.message });
        }
    });
    // 3. Logout -- index.html, admin.html
    router.post('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).json({ success: false, message: 'Failed to log out' });
            }
            res.clearCookie('connect.sid');
            return res.status(200).json({ success: true, message: 'Logout successful' });
        });
    });
    // 4. Show user their videos
    router.get('/videos/:username', async (req, res) => {
        const username = req.params.username;
        try {
            const videos = await getVideos(username);
            res.json(videos);
        } catch (error) {
            console.error('Error getting videos for user:', username, error);
            res.status(500).json({ error: 'Error retrieving videos for this user.' });
        }
    });
    // 5. user upload video -  to process uploading video to S3
    router.post("/upload-video", upload.single("file"), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        try {
            const fileName = sanitizeFilename(req.file.originalname);
            const videoId = uuidv4().split('-')[0];
            const s3Key = `videos/${videoId}/${fileName}`;
            const uploadParams = {
                Bucket: bucketName,
                Key: s3Key,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
            // Respond with the videoId and original file name as title
            res.json({ videoId, title: fileName });
        } catch (error) {
            console.error("Error uploading video to S3:", error);
            res.status(500).json({ error: "Failed to upload video" });
        }
    });

    // 6. user proces video - send sqs message to video service 
    router.post('/process-video', async (req, res) => {
        const { videoId, format, title } = req.body;
        if (!videoId || !format || !title) {
            return res.status(400).json({ success: false, message: 'Invalid request data.' });
        }
        // Create a message 
        const messageBody = {
            action: 'processVideo',
            data: {
                videoId,
                format,
                title,
                username: req.session.user.username
            }
        };
        // Send message to SQS
        try {
            await sendMessageToQueue(messageBody);
            await saveProcessingRequest({
                videoId,
                format,
                title,
                username: req.session.user.username,
            });
            res.json({ success: true, message: 'Video processing initiated.' });

            /** 
            const receivedMessage = await receiveMessageFromQueue();
            if (receivedMessage) {
                const { messageBody, receiptHandle } = receivedMessage;

                // Process the received message
                if (messageBody.action === 'videoProcessed') {
                    const { downloadLink } = messageBody.data;

                    // Delete the processed message from the queue
                    await deleteMessageFromQueue(receiptHandle);

                    return res.json({ success: true, downloadLink });
                }
            }
            res.json({ success: true, message: 'Video processing initiated, waiting for completion.' });
            */
        } catch (error) {
            console.error('Error sending message to SQS:', error);
            res.status(500).json({ success: false, message: 'Failed to initiate video processing.' });
        }
    });

    // 7. check video status in dynamodb- if finished to get donwloadlink from db abck to client side 
    router.get('/check-video-status', async (req, res) => {
        const { videoId } = req.query;

        if (!videoId) {
            return res.status(400).json({ success: false, message: 'videoId is required.' });
        }

        try {
            const processingRequest = await getProcessingRequest(videoId);

            if (!processingRequest) {
                return res.status(404).json({ success: false, message: 'Video not found.' });
            }

            // Verify that the user is authorized to check the status
            if (processingRequest.username !== req.session.user.username) {
                return res.status(403).json({ success: false, message: 'Unauthorized access.' });
            }

            if (processingRequest.status === 'completed') {
                return res.json({
                    success: true,
                    status: 'completed',
                    downloadLink: processingRequest.downloadLink,
                });
            } else if (processingRequest.status === 'failed') {
                return res.json({
                    success: true,
                    status: 'failed',
                    errorMessage: processingRequest.errorMessage || 'Video processing failed.',
                });
            } else {
                return res.json({
                    success: true,
                    status: processingRequest.status, // 'processing'
                });
            }
        } catch (error) {
            console.error('Error checking video status:', error);
            res.status(500).json({ success: false, message: 'Failed to check video status.' });
        }
    });
    return router;
}
module.exports = initializeRoutes;


/**  might not need to -- do in AWS console manually
//POST confitm code -- signup.html
router.post('/confirm', (req, res) => {
    const { confirmCode } = req.body;

    // if code matches - find user - mark confirmed
    if (confirmCode === confirmationCode) {

        const user = users.find(user => !user.isConfirmed);
        if (user) {
            user.isConfirmed = true;
            return res.json({ success: true, message: 'Account confirmed successfully.' });
        }
        return res.json({ success: false, message: 'User not found.' });
    } else {
        return res.json({ success: false, message: 'Invalid confirmation code.' });
    }
});
**/