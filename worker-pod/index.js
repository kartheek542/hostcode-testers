const k8s = require("@kubernetes/client-node");
const {
    SQSClient,
    ReceiveMessageCommand,
    DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const batchV1Api = kc.makeApiClient(k8s.BatchV1Api);

const namespace = "hostcode";
const capacity = 0;

const sqsClient = new SQSClient({ region: "ap-south-1" });

const triggerKubernetesJob = async (message) => {
    const { submissionId, problemId, language } = message;
    const job = {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
            name: `${submissionId}`,
        },
        spec: {
            template: {
                spec: {
                    containers: [
                        {
                            name: "submission-container",
                            image: `docker.io/kartheek542/hostcode:tester-${language}`,
                            env: [
                                {
                                    name: "AWS_ACCESS_KEY_ID",
                                    value: process.env.AWS_ACCESS_KEY_ID,
                                },
                                {
                                    name: "AWS_SECRET_ACCESS_KEY",
                                    value: process.env.AWS_SECRET_ACCESS_KEY,
                                },
                                {
                                    name: "S3_tests",
                                    value: `s3://hostcode-terraform-backend/hostcode-problems/${problemId}/tests`,
                                },
                                {
                                    name: "SUBMISSION",
                                    value: `s3://hostcode-terraform-backend/hostcode-problems/${problemId}/submissions/${language}/${submissionId}`,
                                },
                            ],
                        },
                    ],
                    restartPolicy: "Never",
                },
            },
        },
    };
    const response = await batchV1Api.createNamespacedJob("default", jobJson);
    console.log("Job created successfully:", response.body.metadata.name);
};

const startExecution = async (cnt) => {
    const receiveCommand = new ReceiveMessageCommand({
        QueueUrl:
            "https://sqs.us-east-1.amazonaws.com/123456789012/your-queue-name",
        MaxNumberOfMessages: cnt, // Number of messages to retrieve (1 to 10)
        WaitTimeSeconds: 10, // Long polling time (max 20 seconds)
    });
    const response = await sqsClient.send(receiveCommand);
    if (response.Messages) {
        console.log(`Received ${response.Messages.length} messages.`);
        for (const message of response.Messages) {
            console.log("Message Body:", message.Body);

            // Process the message (custom logic here)
            await triggerKubernetesJob(message.Body);
            // Delete the message after processing
            await deleteMessage(message.ReceiptHandle);
        }
    } else {
        console.log("No messages received.");
    }
};

const listRunningJobsByNamespace = async () => {
    try {
        const response = await batchV1Api.listNamespacedJob(namespace);
        const jobs = response.body.items;

        console.log(`Running Kubernetes Jobs in Namespace: ${namespace}`);

        let runningJobsCnt = 0;
        // Filter and display running jobs
        jobs.forEach((job) => {
            const jobName = job.metadata.name;
            const conditions = job.status.conditions || [];
            const isRunning = conditions.some(
                (condition) =>
                    condition.type === "Complete" &&
                    condition.status === "False"
            );

            if (isRunning) {
                console.log(`- Job Name: ${jobName}`);
                runningJobsCnt++;
            }
        });
        return runningJobsCnt;
    } catch (error) {
        console.error("Error fetching Kubernetes jobs:", error);
    }
};

const startProcess = async () => {
    const jobsCnt = await listRunningJobsByNamespace();
    const toBeRun = capacity - jobsCnt;
    if (toBeRun > 0) {
        await startExecution(toBeRun);
    }
};

setInterval(() => {
    startProcess();
}, 1 * 60 * 1000);
