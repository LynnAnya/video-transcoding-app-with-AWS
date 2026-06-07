require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    QueryCommand,
    DeleteCommand,
    ScanCommand,
    UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');  
const Region = process.env.AWS_REGION;
const QUT_USERNAME = process.env.QUT_USERNAME;
const client = new DynamoDBClient({ region: Region });
const docClient = DynamoDBDocumentClient.from(client);
const usersTableName = "n11363657-assign2-users";
const videosTableName = "n11363657-assign2-videos";
const usersSortKey = 'username';
const videosSortKey = 'videoId';


/**
 * Add User
 * User object containing username, email, and role
 */
async function addUser(user) {
    const command = {
        TableName: usersTableName,
        Item: {
            'qut-username': QUT_USERNAME,
            [usersSortKey]: user.username,
            email: user.email,
            emailVerified: user.email_verified
        },
    };
    try {
        await docClient.send(new PutCommand(command));
        //console.log('User added/updated successfully.');
    } catch (err) {
        console.error('Error adding/updating user:', err);
    }
}

/**
 * Get User Information
 * User item from the Users table
 */
async function getUser(user) {
    const command = {
        TableName: usersTableName,
        Key: {
            'qut-username': QUT_USERNAME,
            [usersSortKey]: user.username,
        },
    };
    try {
        const res = await docClient.send(new GetCommand(command));
        //console.log('User retrieved:', res.Item);
        return res.Item;
    } catch (err) {
        console.error('Error getting user:', err);
    }
}

/**
 * Get all User data
 */ 
async function getAllUsers() {
    const command = {
        TableName: usersTableName,
    };
    try {
        const res = await docClient.send(new ScanCommand(command));
        //console.log('All users retrieved:', res.Items);
        return res.Items;
    } catch (err) {
        console.error('Error getting all users:', err);
    }
}

/**
 * Delete User
 */
async function deleteUser(username) {
    const command = {
        TableName: usersTableName,
        Key: {
            'qut-username': QUT_USERNAME,
            [usersSortKey]: username,
        },
    };
    try {
        await docClient.send(new DeleteCommand(command));
        console.log('User deleted successfully.');
    } catch (err) {
        console.error('Error deleting user:', err);
    }
}

/**
 * Add a Video
 *  - Video object containing title and s3key
 */
async function addVideo(video, user) {
    const videoid = uuidv4().split('-')[0];
    const command = {
        TableName: videosTableName,
        Item: {
            'qut-username': QUT_USERNAME,
            [videosSortKey]: videoid,
            s3key: video.s3key,
            title: video.title,
            username: user.username,
            duration: video.duration,
            thumbnail: video.thumbnail,
            youtubeLink: video.youtubeLink,
            type: video.format.type, 
            quality: video.format.quality,
            status: 'completed',
            downloadLink: video.downloadLink,
        },
    };
    try {
        await docClient.send(new PutCommand(command));
        console.log('Video added successfully.');
        return videoid;
    } catch (err) {
        console.error('Error adding video:', err);
    }
}

/**
 * Get All Videos array for the specific User 
 */
async function getVideos(username) {
    const params = {
        TableName: videosTableName, 
        FilterExpression: '#username = :username', 
        ExpressionAttributeNames: {
            '#username': 'username', 
        },
        ExpressionAttributeValues: {
            ':username': username, 
        },
    };
    try {
        const data = await docClient.send(new ScanCommand(params));
        return data.Items;
    } catch (err) {
        console.error('Error getting videos for user:', username, err);
        throw err;
    }
}
/**
 * Delete a Video
 */
async function deleteVideo(videoid) {
    const params = {
        TableName: videosTableName,
        Key: {
            'qut-username': QUT_USERNAME,
            [videosSortKey]: videoid,
        },
    };
    try {
        await docClient.send(new DeleteCommand(params));
    } catch (err) {
        console.error('Error deleting video:', err);
    }
}

/**
 * Save Processing Request
 * Stores a processing request with status 'processing'
 */
async function saveProcessingRequest(processingRequest) {
    const command = {
        TableName: videosTableName,
        Item: {
            'qut-username': QUT_USERNAME,
            [videosSortKey]: processingRequest.videoId,
            username: processingRequest.username,
            format: processingRequest.format,
            title: processingRequest.title,
            status: 'processing',
            // You can include other fields as needed
        },
    };
    try {
        await docClient.send(new PutCommand(command));
        console.log(`Processing request saved for videoId ${processingRequest.videoId}`);
    } catch (err) {
        console.error('Error saving processing request:', err);
    }
}

/**
 * Get Processing Request
 * Retrieves the processing request by videoId
 */
async function getProcessingRequest(videoId) {
    const command = {
        TableName: videosTableName,
        Key: {
            'qut-username': QUT_USERNAME,
            [videosSortKey]: videoId,
        },
    };
    try {
        const res = await docClient.send(new GetCommand(command));
        //console.log('Processing request retrieved:', res.Item);
        return res.Item;
    } catch (err) {
        console.error('Error getting processing request:', err);
    }
}

/**
 * Update Processing Request
 * Updates the status and downloadLink of the processing request
 */
async function updateProcessingRequest(videoId, updateData) {
    let updateExpression = 'set';
    let expressionAttributeNames = {};
    let expressionAttributeValues = {};

    // Dynamically build the update expression
    const entries = Object.entries(updateData);
    entries.forEach(([key, value], index) => {
        const prefix = index > 0 ? ', ' : ' ';
        updateExpression += `${prefix}#${key} = :${key}`;
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
    });

    const params = {
        TableName: videosTableName,
        Key: {
            'qut-username': QUT_USERNAME,
            [videosSortKey]: videoId,
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
    };

    try {
        await docClient.send(new UpdateCommand(params));
        console.log(`Processing request for videoId ${videoId} updated successfully.`);
    } catch (err) {
        console.error('Error updating processing request:', err);
    }
}



module.exports = {
    addUser,
    getUser,
    getAllUsers,
    deleteUser,
    addVideo,
    getVideos,
    deleteVideo,
    saveProcessingRequest,
    getProcessingRequest,
    updateProcessingRequest,
};


