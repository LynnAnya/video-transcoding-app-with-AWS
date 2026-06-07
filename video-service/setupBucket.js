require("dotenv").config();
const S3 = require("@aws-sdk/client-s3");

const bucketName = process.env.BUCKET_NAME;
const qutUsername = process.env.QUT_USERNAME;
const purpose = process.env.PURPOSE;

async function setupBucket() {
    const s3Client = new S3.S3Client({ region: 'ap-southeast-2' }); 
    // Create the bucket
    const command = new S3.CreateBucketCommand({
        Bucket: bucketName,
    });
    try {
        const response = await s3Client.send(command);
        console.log('Bucket is created at --> ', response.Location); //url of bucket's place is the result
    } catch (err) {
        console.log('Error creating bucket --> ', err);
    }
    // Tag bucket  -- create
    const tagCommand = new S3.PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: {
            TagSet: [
                {
                    Key: 'qut-username',
                    Value: qutUsername,
                },
                {
                    Key: 'purpose',
                    Value: purpose,
                }
            ],
        },
    });
    //send command to tag
    try {
        const tagResponse = await s3Client.send(tagCommand);
        console.log('Bucket tagged:', tagResponse);
    } catch (err) {
        console.log('Error tagging bucket:', err);
    }
}

setupBucket();

// have to run fist to set bucket once -- not included in app.js 
//run once and done -- might check if run
// can access globally as in AWs 