const configPromise = require("../config");
const express = require('express');
const app = express();
//require("dotenv").config();
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require("multer");
const ffmpegPath = path.join(__dirname, '..', 'ffmpeg', 'bin', 'ffmpeg.exe');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { v4: uuidv4 } = require("uuid");
const S3Presigner = require("@aws-sdk/s3-request-presigner");
const { addVideo } = require("../dynamodb");
ffmpeg.setFfmpegPath(ffmpegPath);

async function initializeRoutes() {
    const config = await configPromise;
    const { aws_region: Region, bucket_name: bucketName } = config;
    const s3Client = new S3Client({ region: Region });
    const router = express.Router();
    const upload = multer(); // In-memory storage for multer

    function sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    }
    /**
     * 1. Route to handle video upload and store in S3
     */
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
    /**
     * Route to process (transcode) video, store metadata in DynamoDB, and get a presigned URL
     */
    router.post("/process-video", async (req, res) => {
        const { videoId, format, title } = req.body;
        /** 
        if (!req.session.user) {
            return res.status(403).json({ error: "User not logged in." });
        } */
        if (!videoId || !format) {
            return res.status(400).json({ error: "Video ID and format are required." });
        }
        try {
            console.log("---- s3 key ----")
            const originalKey = `videos/${videoId}/${title}`;
            console.log(originalKey)
            const transcodedFileName = `${title.split(".")[0]}_converted.${format.split(".")[1]}`;
            console.log(transcodedFileName)
            const s3Key = `videos/${videoId}/${transcodedFileName}`;
            console.log(s3Key)
            // Transcode and upload to S3
            await transcodeToS3(originalKey, format, s3Key, title);

            // Metadata for DynamoDB
            const videoData = {
                s3key: s3Key,
                title: title,
                duration: null, 
                thumbnail: null, // No thumbnail since this is not from YouTube
                youtubeLink: null, // No YouTube link, local video only
                format: { type: format.split(".")[1], quality: parseInt(format.split(".")[0], 10) },
            };
            await addVideo(videoData, req.session.user);

            // Generate a presigned URL for the transcoded video
            const s3Url = await getPresignedUrl(s3Key, transcodedFileName);
            res.json({ downloadLink: s3Url });
        } catch (error) {
            console.error("Error processing video -->", error);
            res.status(500).json({ error: "Error processing video." });
        }
    });
    async function transcodeToS3(originalKey, format, s3Key, title) {
        try {
            // Download the original video from S3 as input for FFmpeg
            const data = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: originalKey }));
            const videoStream = data.Body;
    
            console.log("Video stream obtained from S3.");
    
            let ffmpegCommand = ffmpeg(videoStream);
    
            // Switch-case for different transcoding options
            switch (format) {
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
                    throw new Error('Unsupported format.');
            }
    
            // Log the FFmpeg command for debugging
            ffmpegCommand.on('start', (commandLine) => {
                console.log('FFmpeg command:', commandLine);
            });
            // Set temporary file path
            const sanitizedTitle = sanitizeFilename(title);
            const tempFileName = `${sanitizedTitle}_converted.${format.split('.')[1]}`;
            const tempFilePath = path.join(os.tmpdir(), tempFileName).replace(/\\/g, '/');
            console.log("Temporary file path:", tempFilePath);
    
            // Transcode and save to temporary file
            await new Promise((resolve, reject) => {
                ffmpegCommand
                    .save(tempFilePath)
                    .on('end', resolve)
                    .on('error', (err) => {
                        console.error('FFmpeg error:', err);
                        reject(err);
                    });
            });
    
            console.log("Transcoding completed.");
            // Upload the temporary file to S3
            const fileStream = fs.createReadStream(tempFilePath);
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
    
            // Clean up temporary file after upload
            fs.unlink(tempFilePath, (err) => {
                if (err) {
                    console.error('Error deleting temporary file:', err);
                } else {
                    console.log('Temporary file deleted.');
                }
            });
        } catch (err) {
            console.error('Error processing video -->', err);
            throw err;
        }
    }
    /**
     * 3. Generate a presigned URL for the S3 object
     * @param {*} s3Key 
     * @param {*} transcodedFileName 
     * @returns 
     */
    async function getPresignedUrl(s3Key, transcodedFileName) {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            ResponseContentDisposition: `attachment; filename="${transcodedFileName}"`,
        });
        return await S3Presigner.getSignedUrl(s3Client, command, { expiresIn: 3600 });
    }
    return router;
}
module.exports = initializeRoutes;


/** 
async function initializeRoutes() {
    const config = await configPromise;
    const { aws_region: Region, bucket_name: bucketName } = config;
    const s3Client = new S3Client({ region: Region });
    const router = express.Router();
    function sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    }
    // POST to transcode and upload to S3 as required
    router.post('/process-video', async (req, res) => {
        const { videoId, format } = req.body;
        if (!req.session.user) {
            return res.status(403).json({ error: 'User not logged in.' });
        }
        if (!videoId || !format) {
            return res.status(400).json({ error: 'Video ID and format are required.' });
        }
        try {
            const videoInfo = await ytdl.getInfo(videoId, {   //make chang adding header 30/10/24
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                    }
                }
            });
            const [quality, type] = format.split('.');
            const videoTitle = videoInfo.videoDetails.title;
            const sanitizedTitle = sanitizeFilename(videoTitle);
            const transcodedFileName = `${sanitizedTitle}_${format}`;
            const s3Key = `videos/${transcodedFileName}`;
            const durationInSecs = parseInt(videoInfo.videoDetails.lengthSeconds, 10);
            const formattedDuration = formatDuration(`PT${Math.floor(durationInSecs / 3600)}H${Math.floor((durationInSecs % 3600) / 60)}M${durationInSecs % 60}S`);
            const thumbnails = videoInfo.videoDetails.thumbnails;
            const highqualityThumbnail = thumbnails[thumbnails.length - 1].url;
            const youtubeLink = videoInfo.videoDetails.video_url;

            await transcodeToS3(videoId, format, s3Key);

            // add video data to Dynamodb
            const videoData = {
                s3key: s3Key,
                title: videoTitle,
                duration: formattedDuration,
                thumbnail: highqualityThumbnail,
                youtubeLink: youtubeLink,
                format: { type: type, quality: parseInt(quality, 10) },
            };
            await addVideo(videoData, req.session.user);

            //get pre-signed url 
            const s3Url = await getPresignedUrl(s3Key, transcodedFileName);
            res.json({ downloadLink: s3Url });
        } catch (error) {
            console.error('Error processing video -->', error);
            res.status(500).json({ error: 'Error processing video.' });
        }
    });

    async function transcodeToS3(videoId, format, s3Key) {
        return new Promise((resolve, reject) => {
            const videoStream = ytdl(videoId, {
                filter: (f) => f.hasVideo && f.hasAudio,
                quality: 'highest',
            }).on('error', (err) => {
                console.error('ytdl error:', err);
                reject(err);
            });
            let ffmpegCommand = ffmpeg(videoStream);

            switch (format) {
                case '360.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('640x360')
                        .format('mp4')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '480.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('854x480')
                        .format('mp4')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '720.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('1280x720')
                        .format('mp4')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '1080.mp4':
                    ffmpegCommand = ffmpegCommand
                        .size('1920x1080')
                        .format('mp4')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .outputOptions([
                            '-movflags frag_keyframe+empty_moov',
                            '-preset veryfast',
                            '-crf 23',
                        ]);
                    break;
                case '480.webm':
                    ffmpegCommand = ffmpegCommand
                        .size('854x480')
                        .format('webm')
                        .videoCodec('libvpx')
                        .audioCodec('libvorbis');
                    break;
                case '720.webm':
                    ffmpegCommand = ffmpegCommand
                        .size('1280x720')
                        .format('webm')
                        .videoCodec('libvpx')
                        .audioCodec('libvorbis');
                    break;
                default:
                    return reject(new Error('Unsupported format.'));
            }

            ffmpegCommand
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                });
            // Get the output stream from FFmpeg
            const ffmpegStream = ffmpegCommand.pipe().on('error', (err) => {
                console.error('FFmpeg pipe error:', err);
                reject(err);
            });
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: ffmpegStream,
                    ContentType: format.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
                },
            });
            // Start the upload and handle completion
            upload.done()
                .then(() => {
                    //console.log('Upload to S3 completed.');
                    resolve(); // when  upload is done
                })
                .catch((err) => {
                    console.error('Upload error:', err);
                    reject(err);
                });
            // No need to call ffmpegCommand.run(),  pipe() starts the process
        });
    }
    async function getPresignedUrl(s3Key, transcodedFileName) {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            ResponseContentDisposition: `attachment; filename="${transcodedFileName}"`,
        });
        const presignedURL = await S3Presigner.getSignedUrl(s3Client, command, { expiresIn: 3600 });
        //console.log("this is presign url -- > ", presignedURL)
        return presignedURL;
    }
    return router;
}
module.exports = initializeRoutes;
*/


