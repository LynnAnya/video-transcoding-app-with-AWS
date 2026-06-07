const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");
const client = new SSMClient({ region: "ap-southeast-2" });
const parameterNames = [
  "/n11363657/assignment2/dns",
  "/n11363657/assignment2/bucket_name",
  "/n11363657/assignment2/qut_username",
  "/n11363657/assignment2/purpose",
  "/n11363657/assignment2/aws_region",
  "/n11363657/assignment2/userpool_id",
  "/n11363657/assignment2/client_id",
  "/n11363657/assignment2/session_secret",
];

let config = {}; 
async function fetchParameters() {
  try {
    const command = new GetParametersCommand({ Names: parameterNames });
    const response = await client.send(command);

    if (response.InvalidParameters && response.InvalidParameters.length > 0) {
      console.warn("Invalid Parameters:", response.InvalidParameters);
    }

    // Populate config object 
    response.Parameters.forEach((param) => {
      const key = param.Name.split("/").pop();
      config[key] = param.Value;
    });

    return config; 
  } catch (error) {
    console.error("Error fetching parameters from SSM:", error);
    throw error; 
  }
}
const configPromise = fetchParameters();
module.exports = configPromise;