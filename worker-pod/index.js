import { KubeConfig, BatchV1Api } from "@kubernetes/client-node";
import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SQSClient,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

const kc = new KubeConfig();
kc.loadFromCluster();
const batchV1Api = kc.makeApiClient(BatchV1Api);

const namespace = "hostcode";
const capacity = 2;

const sqsClient = new SQSClient({ region: "ap-south-1" });

const triggerKubernetesJob = async (message) => {
  console.log(message);
  const { submissionId, problemId, language } = JSON.parse(message);
  console.log(
    `Values are submissionId: ${submissionId}, problemId: ${problemId}`
  );
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
  console.log("Job JSON is: ", job);
  const response = await batchV1Api.createNamespacedJob(namespace, job);
  console.log("Job created successfully:", response.body.metadata.name);
};

const deleteSQSMessage = async (receiptHandle) => {
  try {
    console.log("Deleting message");
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl:
          "https://sqs.ap-south-1.amazonaws.com/159284330056/hostcode-worker",
        ReceiptHandle: receiptHandle,
      })
    );
  } catch (e) {
    console.log("Error occured while deleting message:", e);
  }
};

const startExecution = async (cnt) => {
  try {
    console.log("Polling for messages ...");
    const receiveCommand = new ReceiveMessageCommand({
      QueueUrl:
        "https://sqs.ap-south-1.amazonaws.com/159284330056/hostcode-worker",
      MaxNumberOfMessages: cnt,
      WaitTimeSeconds: 0,
    });
    const response = await sqsClient.send(receiveCommand);
    if (response.Messages) {
      console.log(`Received ${response.Messages.length} messages.`);
      for (const message of response.Messages) {
        console.log("Message Body:", message.Body);

        await triggerKubernetesJob(message.Body);
        // Deleting the message after processing
        await deleteSQSMessage(message.ReceiptHandle);
      }
    } else {
      console.log("No messages received.");
    }
  } catch (e) {
    console.log("Error occured while polling messages: ", e);
  }
};

const listRunningJobsByNamespace = async () => {
  try {
    const response = await batchV1Api.listNamespacedJob({ namespace });
    const jobs = response.items;

    console.log(`Running Kubernetes Jobs in Namespace: ${jobs}`);

    let runningJobsCnt = 0;
    // Filter and display running jobs
    jobs.forEach((job) => {
      console.log("----------");
      console.log("Job status obj is >>>", job.status);
      if(job.status.active && job.status.active > 0) {
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
  // const jobsCnt = 0;
  console.log("Current running jobs are", jobsCnt);
  const toBeRun = capacity - jobsCnt;
  if (toBeRun > 0) {
    console.log("executing", toBeRun);
    await startExecution(toBeRun);
  } else {
    console.log("Queue is currently full");
  }
};

// startProcess()
setInterval(() => {
  console.log("Starting the Worker Pod");
  startProcess();
}, 1 * 60 * 1000);
