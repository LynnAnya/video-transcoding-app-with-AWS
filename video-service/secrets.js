const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const secret_name = "n11363657-assign2";   
const client = new SecretsManagerClient({ region: "ap-southeast-2" });

async function getSecret() {
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secret_name
            })
        );
        if (!response.SecretString) {
            throw new Error("SecretString is empty");
        }
        const secret = response.SecretString;
        
        const secretData = JSON.parse(secret); // Assuming secret is stored as a JSON string
        return secretData;
    } catch (error) {
        console.error("Error retrieving the secret:", error);
        throw error;
    }
}
module.exports = { getSecret };
