// video-service/videoProcessor.js
require("dotenv").config();
const configPromise = require("./config");
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
//const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
//const { SQS_QUEUE_URL } = process.env;
const { addVideo, updateProcessingRequest } = require("./dynamodb");
//const ffmpegPath = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const ffmpegPath = '/usr/bin/ffmpeg';
ffmpeg.setFfmpegPath(ffmpegPath);

async function processVideoMessage(messageBody) {
    const { action, data } = messageBody;
    if (action === "processVideo") {
        const { videoId, format, title, username } = data;
        // Validate required fields
        if (!videoId || !format || !title || !username) {
            console.error("Missing required data fields in message:", messageBody);
            return;
        }
        try {
            console.log(`Processing video: VideoID=${videoId}, Format=${format}, Title=${title}, User=${username}`);
            const config = await configPromise;
            const { aws_region: Region, bucket_name: bucketName } = config;
            const s3Client = new S3Client({ region: Region });
            //const sqsClient = new SQSClient({ region: Region });

            // Define the S3 key for the original video
            const originalKey = `videos/${videoId}/${title}`;
            console.log(`Original S3 Key: ${originalKey}`);

            // Define the S3 key for the transcoded video
            const sanitizedTitle = sanitizeFilename(title.split(".")[0]);
            const formatExtension = format.split(".")[1];
            const transcodedFileName = `${sanitizedTitle}_converted.${formatExtension}`;
            const s3Key = `videos/${videoId}/${transcodedFileName}`;
            console.log(`Transcoded S3 Key: ${s3Key}`);

            // Transcode and upload to S3
            await transcodeToS3(s3Client, bucketName, originalKey, format, s3Key, title);

            // Generate presigned URL (downloadLink)
            const presignedUrl = await getPresignedUrl(s3Client, bucketName, s3Key, transcodedFileName);
            console.log(`Presigned Download Link: ${presignedUrl}`);

            // Update the processing request with video metadata
            const videoData = {
                status: 'completed',
                s3key: s3Key,
                downloadLink: presignedUrl,
                duration: null, // Can be null if not available
                thumbnail: null, // No thumbnail since this is not from YouTube
                youtubeLink: null, // Local video, so no YouTube link
                type: formatExtension,
                quality: parseInt(format.split(".")[0], 10),
            };
            await updateProcessingRequest(videoId, videoData);
            console.log(`Processing request for videoId ${videoId} updated successfully.`);
            
        } catch (error) {
            console.error("Error processing video:", error);
            // Update the processing request status to 'failed'
            await updateProcessingRequest(videoId, {
                status: 'failed',
                errorMessage: error.message,
            });
        }
    } else {
        console.log("Unknown action:", action);
    }
}
async function transcodeToS3(s3Client, bucketName, originalKey, format, s3Key, title) {
    try {
        // Download the original video from S3 to a temporary file
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-'));
        const tempOriginalPath = path.join(tempDir, sanitizeFilename(title));
        const tempTranscodedPath = path.join(tempDir, path.basename(s3Key));
        console.log(`Downloading original video to temporary path: ${tempOriginalPath}`);
        const downloadParams = {
            Bucket: bucketName,
            Key: originalKey,
        };
        const data = await s3Client.send(new GetObjectCommand(downloadParams));
        // Create a writable stream to save the original video
        const writeStream = fs.createWriteStream(tempOriginalPath);
        // Pipe the data stream into the file
        await new Promise((resolve, reject) => {
            data.Body.pipe(writeStream);
            data.Body.on('error', reject);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        console.log(`Original video downloaded to: ${tempOriginalPath}`);
        await new Promise((resolve, reject) => {
            let ffmpegCommand = ffmpeg(tempOriginalPath);
            // Switch-case for different transcoding options
            switch (format.toLowerCase()) {
                case '360.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('640x360')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .format('mp4')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '480.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('854x480')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .format('mp4')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '720.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('1280x720')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .format('mp4')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '1080.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('1920x1080')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .format('mp4')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '480.webm':
                    ffmpegCommand = ffmpegCommand
                        .size('854x480')
                        .videoCodec('libvpx')
                        .audioCodec('libvorbis')
                        .format('webm');
                    break;
                case '720.webm':
                    ffmpegCommand = ffmpegCommand
                        .size('1280x720')
                        .videoCodec('libvpx')
                        .audioCodec('libvorbis')
                        .format('webm');
                    break;
                default:
                    reject(new Error('Unsupported format.'));
                    return;
            }
            // Log the FFmpeg command for debugging
            ffmpegCommand.on('start', (commandLine) => {
                console.log('FFmpeg command:', commandLine);
            });
            // Transcode and save to temporary file
            ffmpegCommand
                .save(tempTranscodedPath)
                .on('end', resolve)
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                });
        });
        console.log(`Transcoding completed: ${tempTranscodedPath}`);
        // Upload the transcoded video back to S3
        const fileStream = fs.createReadStream(tempTranscodedPath);
        console.log('Uploading to S3 with parameters:');
        console.log('Bucket:', bucketName);
        console.log('Key:', s3Key);
        console.log('ContentType:', format.endsWith('.mp4') ? 'video/mp4' : 'video/webm');
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: bucketName,
                Key: s3Key,
                Body: fileStream,
                ContentType: format.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
            },
        });
        await upload.done();
        console.log("Upload to S3 completed.");
        // Clean up temporary files
        fs.unlinkSync(tempOriginalPath);
        fs.unlinkSync(tempTranscodedPath);
        fs.rmdirSync(tempDir, { recursive: true });
        console.log('Temporary files cleaned up.');
    } catch (err) {
        console.error('Error in transcodeToS3:', err);
        throw err;
    }
}
async function getPresignedUrl(s3Client, bucketName, s3Key, transcodedFileName) {
    console.log("this is insdie presignnnnnnnnnnnnnnnn");
    console.log("s3Client:", s3Client);
    console.log("bucketName:", bucketName);
    console.log("s3Key:", s3Key);
    console.log("transcodedFileName:", transcodedFileName);
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${transcodedFileName}"`,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
}
function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}
module.exports = { processVideoMessage };
